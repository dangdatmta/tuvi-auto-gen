from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def empty_result(image_path: Path) -> dict:
    return {
        "file": f"assets/internet/{image_path.name}",
        "width": 0,
        "height": 0,
        "paths": [],
        "hasSubjectLayer": False,
    }


def contour_to_path(contour) -> str:
    points = contour.reshape(-1, 2)
    if len(points) < 3:
        return ""
    commands = [f"M {int(points[0][0])} {int(points[0][1])}"]
    commands.extend(f"L {int(x)} {int(y)}" for x, y in points[1:])
    commands.append("Z")
    return " ".join(commands)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate subject outline SVG paths from image files.")
    parser.add_argument("--images-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="isnet-general-use")
    parser.add_argument("--min-area-ratio", type=float, default=0.015)
    parser.add_argument("--max-contours", type=int, default=3)
    parser.add_argument("--enable-layers", action="store_true")
    args = parser.parse_args()

    images_dir = Path(args.images_dir)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    image_paths = sorted(
        path for path in images_dir.iterdir()
        if path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
    )

    try:
        import cv2
        import numpy as np
        from PIL import Image, ImageFilter
        from rembg import new_session, remove
    except Exception as exc:
        print(f"Subject outline dependencies unavailable: {exc}", file=sys.stderr)
        output.write_text(json.dumps({
            "enabled": False,
            "error": str(exc),
            "images": [empty_result(path) for path in image_paths],
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0

    try:
        session = new_session(args.model)
    except Exception as exc:
        print(f"Subject outline model unavailable: {exc}", file=sys.stderr)
        output.write_text(json.dumps({
            "enabled": False,
            "error": str(exc),
            "images": [empty_result(path) for path in image_paths],
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0

    results = []
    for image_path in image_paths:
        try:
            image = Image.open(image_path).convert("RGBA")
            cutout = remove(image, session=session)
            alpha = np.array(cutout.getchannel("A"))
            height, width = alpha.shape[:2]
            _, binary = cv2.threshold(alpha, 24, 255, cv2.THRESH_BINARY)
            kernel = np.ones((9, 9), np.uint8)
            binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            min_area = width * height * args.min_area_ratio
            usable = [contour for contour in contours if cv2.contourArea(contour) >= min_area]
            usable.sort(key=cv2.contourArea, reverse=True)

            paths = []
            layer_mask = np.zeros((height, width), dtype=np.uint8)
            for contour in usable[:args.max_contours]:
                cv2.drawContours(layer_mask, [contour], -1, 255, thickness=cv2.FILLED)
                epsilon = 0.006 * cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, epsilon, True)
                path_d = contour_to_path(approx)
                if path_d:
                    paths.append({
                        "d": path_d,
                        "area": float(cv2.contourArea(contour)),
                    })

            subject_png = None
            shadow_png = None
            bounds = None
            has_subject_layer = args.enable_layers and bool(paths)
            if has_subject_layer:
                x, y, w, h = cv2.boundingRect(layer_mask)
                bounds = {"x": int(x), "y": int(y), "width": int(w), "height": int(h)}

                feathered = Image.fromarray(layer_mask).filter(ImageFilter.GaussianBlur(radius=1.2))
                subject = image.copy()
                subject.putalpha(feathered)

                subject_png = f"assets/masks/{image_path.stem}-subject.png"
                subject.save(output.parent / f"{image_path.stem}-subject.png")

                shadow_alpha = Image.fromarray(layer_mask).filter(ImageFilter.GaussianBlur(radius=18))
                shadow_alpha = shadow_alpha.point(lambda value: int(value * 0.72))
                shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
                shadow.putalpha(shadow_alpha)
                shadow_png = f"assets/masks/{image_path.stem}-shadow.png"
                shadow.save(output.parent / f"{image_path.stem}-shadow.png")

            results.append({
                "file": f"assets/internet/{image_path.name}",
                "width": width,
                "height": height,
                "paths": paths,
                "subjectPng": subject_png,
                "shadowPng": shadow_png,
                "bounds": bounds,
                "hasSubjectLayer": has_subject_layer,
            })
        except Exception as exc:
            print(f"Skipping subject outline for {image_path.name}: {exc}", file=sys.stderr)
            result = empty_result(image_path)
            result["error"] = str(exc)
            results.append(result)

    output.write_text(json.dumps({
        "enabled": True,
        "model": args.model,
        "images": results,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
