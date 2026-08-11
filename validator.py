#!/usr/bin/env python3
"""SIP/Diameter 퀴즈 YAML 문제파일 검증기.

guide.md의 검증 규율을 강제한다: 타입별 필수 필드, id 형식/중복, ref 필수,
topic/tags 허용 목록. 실패 시 문제 ID와 함께 에러를 출력하고 비정상 종료한다.
"""
import glob
import re
import sys

import yaml

ALLOWED_TOPICS = {
    "SIP": "sip",
    "Diameter": "diam",
    "IMS": "ims",
}
ALLOWED_TAGS = {
    "response-code", "method", "header", "message-flow",
    "avp", "command-code", "result-code", "transport", "concept",
}
ALLOWED_DIFFICULTY = {"basic", "advanced"}
VALID_TYPES = {"mcq", "ox", "short", "order", "steps"}
ID_RE = re.compile(r"^([a-z]+)-(\d{4})$")


def load_yaml_files(paths):
    questions = []
    for path in paths:
        with open(path, encoding="utf-8") as f:
            try:
                data = yaml.safe_load(f)
            except yaml.YAMLError as e:
                raise SystemExit(
                    f"[{path}] YAML 파싱 오류 — 콜론+공백(': ')이 들어간 한 줄 문자열은 "
                    f"따옴표로 감쌌는지 확인:\n{e}"
                )
        if not data:
            continue
        if not isinstance(data, list):
            raise SystemExit(f"[{path}] 최상위는 리스트여야 함")
        for q in data:
            if not isinstance(q, dict):
                raise SystemExit(f"[{path}] 리스트 항목이 매핑(dict)이 아님: {q!r}")
            q = dict(q)
            q["_file"] = path
            questions.append(q)
    return questions


def validate(questions):
    errors = []
    seen_ids = {}

    for q in questions:
        qid = q.get("id", "<no id>")
        loc = f"{qid} ({q.get('_file', '?')})"

        if "id" not in q:
            errors.append(f"[{loc}] id 필드 없음")
        else:
            m = ID_RE.match(str(q["id"]))
            if not m:
                errors.append(
                    f"[{loc}] id 형식 오류 — '접두어-4자리숫자' 형식이어야 함 (예: sip-0001)"
                )
            if qid in seen_ids:
                errors.append(f"[{loc}] id 중복 (이미 {seen_ids[qid]}에서 사용)")
            else:
                seen_ids[qid] = q.get("_file")

        topic = q.get("topic")
        if topic not in ALLOWED_TOPICS:
            errors.append(
                f"[{loc}] topic 허용되지 않음: {topic!r} (허용: {sorted(ALLOWED_TOPICS)})"
            )
        elif "id" in q:
            m = ID_RE.match(str(q["id"]))
            expected_prefix = ALLOWED_TOPICS[topic]
            if m and m.group(1) != expected_prefix:
                errors.append(
                    f"[{loc}] id 접두어 '{m.group(1)}'가 topic '{topic}'과 불일치 "
                    f"(기대: {expected_prefix}-)"
                )

        difficulty = q.get("difficulty")
        if difficulty not in ALLOWED_DIFFICULTY:
            errors.append(
                f"[{loc}] difficulty 허용되지 않음: {difficulty!r} "
                f"(허용: {sorted(ALLOWED_DIFFICULTY)}, 필수)"
            )

        tags = q.get("tags")
        if not tags or not isinstance(tags, list):
            errors.append(f"[{loc}] tags 없음 또는 리스트 아님")
        else:
            bad = [t for t in tags if t not in ALLOWED_TAGS]
            if bad:
                errors.append(
                    f"[{loc}] 허용되지 않은 tags: {bad} (허용: {sorted(ALLOWED_TAGS)})"
                )

        if not str(q.get("question", "")).strip():
            errors.append(f"[{loc}] question 비어있음")

        if not str(q.get("explain", "")).strip():
            errors.append(f"[{loc}] explain 비어있음")

        if not str(q.get("ref", "")).strip():
            errors.append(f"[{loc}] ref 비어있음 (필수)")

        qtype = q.get("type")
        if qtype not in VALID_TYPES:
            errors.append(f"[{loc}] type 누락 또는 알 수 없는 값: {qtype!r}")
            continue

        if qtype == "mcq":
            choices = q.get("choices")
            if not isinstance(choices, list) or len(choices) < 2:
                errors.append(f"[{loc}] mcq choices가 없거나 2개 미만")
            else:
                answer = q.get("answer")
                if isinstance(answer, bool) or not isinstance(answer, int) \
                        or not (0 <= answer < len(choices)):
                    errors.append(
                        f"[{loc}] mcq answer가 choices 인덱스 범위를 벗어남: {answer!r}"
                    )
        elif qtype == "ox":
            answer = q.get("answer")
            if not isinstance(answer, bool):
                errors.append(f"[{loc}] ox answer가 불리언이 아님: {answer!r}")
        elif qtype == "short":
            answer = q.get("answer")
            if not isinstance(answer, list) or len(answer) == 0 \
                    or not all(str(a).strip() for a in answer):
                errors.append(
                    f"[{loc}] short answer가 비어있지 않은 문자열 리스트가 아님: {answer!r}"
                )
        elif qtype == "order":
            items = q.get("items")
            if not isinstance(items, list) or len(items) < 2:
                errors.append(f"[{loc}] order items가 없거나 2개 미만")
            else:
                _check_order_items(errors, loc, "items", items)
            # decoys: 정답이 아닌 오답 조각(선택). 구조는 items와 동일({msg,from,to}).
            decoys = q.get("decoys")
            if decoys is not None:
                if not isinstance(decoys, list) or len(decoys) == 0:
                    errors.append(f"[{loc}] order decoys가 비어있지 않은 리스트가 아님")
                else:
                    _check_order_items(errors, loc, "decoys", decoys)
        elif qtype == "steps":
            steps = q.get("steps")
            if not isinstance(steps, list) or len(steps) < 2:
                errors.append(f"[{loc}] steps가 없거나 2개 미만")
            else:
                _check_steps_items(errors, loc, "steps", steps)
            decoys = q.get("decoys")
            if decoys is not None:
                if not isinstance(decoys, list) or len(decoys) == 0:
                    errors.append(f"[{loc}] steps decoys가 비어있지 않은 리스트가 아님")
                else:
                    _check_steps_items(errors, loc, "decoys", decoys)

    return errors


def _check_order_items(errors, loc, field, items):
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"[{loc}] {field}[{i}]가 매핑이 아님 (msg/from/to 필요)")
            continue
        for key in ("msg", "from", "to"):
            if not str(item.get(key, "")).strip():
                errors.append(f"[{loc}] {field}[{i}].{key} 비어있음")
        if item.get("from") and item.get("from") == item.get("to"):
            errors.append(f"[{loc}] {field}[{i}] from/to가 동일함")


def _check_steps_items(errors, loc, field, items):
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"[{loc}] {field}[{i}]가 매핑이 아님 (actor/act 필요)")
            continue
        for key in ("actor", "act"):
            if not str(item.get(key, "")).strip():
                errors.append(f"[{loc}] {field}[{i}].{key} 비어있음")


def main():
    paths = sys.argv[1:] or sorted(glob.glob("*.yaml"))
    if not paths:
        print("검증할 YAML 파일이 없습니다.")
        sys.exit(1)

    questions = load_yaml_files(paths)
    errors = validate(questions)

    if errors:
        print(f"검증 실패: {len(errors)}개 오류\n")
        for e in errors:
            print(" -", e)
        sys.exit(1)

    print(f"검증 통과: {len(questions)}개 문제, {len(paths)}개 파일")


if __name__ == "__main__":
    main()
