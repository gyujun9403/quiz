#!/usr/bin/env python3
"""YAML 문제파일 → 단일 self-contained HTML 변환기.

검증기(validator.py)를 먼저 통과시킨 뒤에만 HTML을 생성한다. 데이터는 HTML
안에 인라인하며(file:// 에서 fetch가 막히므로 외부 참조 없음), 셔플/출제
로직은 전부 브라우저 JS에서 런타임에 처리한다. 화면 코드는 web/ 아래 세 파일
(template.html 뼈대, style.css, app.js)에 있고, 빌드할 때 하나로 합친다.
"""
import json
import os
import re
import sys

from validator import (ACTOR_ORDER, CONCEPTS_FILE, is_openable, lint, load_sets, load_yaml_files, question_files,
                       validate, validate_concepts, validate_sets)

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
# claude.ai 게시용 사본(빌드 산출물, git에 넣지 않음)
ARTIFACT_OUT = "claude-quiz.html"


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
    set_errors, sets = validate_sets(load_sets(), {q.get("id") for q in questions})
    errors += set_errors
    concept_errors, concepts = validate_concepts(load_sets(CONCEPTS_FILE), sets, questions)
    errors += concept_errors
    if errors:
        print(f"검증 실패: {len(errors)}개 오류 — HTML을 생성하지 않습니다.\n")
        for e in errors:
            print(" -", e)
        sys.exit(1)

    clean = []
    for q in questions:
        q = dict(q)
        q.pop("_file", None)
        q["openable"] = is_openable(q)
        clean.append(q)

    def to_json(obj):
        return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")
    html = (load_template()
            .replace("__QUIZ_DATA__", to_json(clean))
            .replace("__SETS_DATA__", to_json(sets))
            .replace("__CONCEPTS_DATA__", to_json(concepts))
            .replace("__ACTOR_ORDER__", to_json(ACTOR_ORDER)))

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    # claude.ai 게시용 사본: 게시할 때 <html>/<head>/<body> 뼈대가 씌워지므로 뼈대 없이
    # <title>, <style>, body 내용만 둔다. 여기서는 주관식 모드(Claude 채점)가 켜진다.
    title = re.search(r"<title>.*?</title>", html, re.S).group(0)
    style = re.search(r"<style>.*?</style>", html, re.S).group(0)
    body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
    with open(ARTIFACT_OUT, "w", encoding="utf-8") as f:
        f.write(title + "\n" + style + "\n" + body.strip() + "\n")

    n_pages = sum(len(v) for k, v in concepts.items() if not any(s["id"] == k and s["include"] for s in sets))
    n_open = sum(1 for q in clean if q["openable"])
    print(f"생성 완료: {out_path} ({len(clean)}문제, {len(paths)}개 파일, 세트 {len(sets)}개, 개념 페이지 {n_pages}개)")
    print(f"           {ARTIFACT_OUT} (claude.ai 게시용, 주관식 대상 {n_open}문제)")
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
        paths = question_files()
    if not paths:
        print("변환할 YAML 파일이 없습니다.")
        sys.exit(1)
    build(paths, out_path)


if __name__ == "__main__":
    main()
