#!/usr/bin/env python3
"""YAML 문제파일 → 단일 self-contained HTML 변환기.

검증기(validator.py)를 먼저 통과시킨 뒤에만 HTML을 생성한다. 데이터는 HTML
안에 인라인하며(file:// 에서 fetch가 막히므로 외부 참조 없음), 셔플/출제
로직은 전부 브라우저 JS에서 런타임에 처리한다. 화면 코드는 web/ 아래 세 파일
(template.html 뼈대, style.css, app.js)에 있고, 빌드할 때 하나로 합친다.
"""
import glob
import json
import os
import sys

from validator import lint, load_yaml_files, validate

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


def load_template():
    """web/ 아래 HTML 뼈대에 CSS와 JS를 끼워 넣어 단일 HTML 템플릿을 만든다."""
    def read(name):
        with open(os.path.join(WEB_DIR, name), encoding="utf-8") as f:
            return f.read()
    return (read("template.html")
            .replace("__STYLE__", read("style.css"))
            .replace("__APP__", read("app.js")))


def build(paths, out_path):
    questions = load_yaml_files(paths)
    errors = validate(questions)
    if errors:
        print(f"검증 실패: {len(errors)}개 오류 — HTML을 생성하지 않습니다.\n")
        for e in errors:
            print(" -", e)
        sys.exit(1)

    clean = []
    for q in questions:
        q = dict(q)
        q.pop("_file", None)
        clean.append(q)

    data_json = json.dumps(clean, ensure_ascii=False).replace("</", "<\\/")
    html = load_template().replace("__QUIZ_DATA__", data_json)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"생성 완료: {out_path} ({len(clean)}문제, {len(paths)}개 파일)")
    for w in lint(questions):
        print(" 경고:", w)


def main():
    args = sys.argv[1:]
    out_path = "quiz.html"
    paths = []
    it = iter(args)
    for a in it:
        if a == "-o":
            out_path = next(it)
        else:
            paths.append(a)
    if not paths:
        paths = sorted(glob.glob("*.yaml"))
    if not paths:
        print("변환할 YAML 파일이 없습니다.")
        sys.exit(1)
    build(paths, out_path)


if __name__ == "__main__":
    main()
