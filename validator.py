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
    "EPC": "epc",
}
ALLOWED_TAGS = {
    "response-code", "method", "header", "message-flow",
    "avp", "command-code", "result-code", "transport", "concept",
}
ALLOWED_DIFFICULTY = {"basic", "advanced"}
VALID_TYPES = {"mcq", "ox", "short", "order", "steps", "match"}
MATCH_MIN_PAIRS, MATCH_MAX_PAIRS = 2, 6
ID_RE = re.compile(r"^([a-z]+)-(\d{4})$")
# 문제 묶음(세트) 정의 파일. 문제 파일이 아니므로 기본 문제 파일 목록(*.yaml)에서 뺀다.
SETS_FILE = "sets.yaml"
# 세트별 개념 페이지 정의 파일. 이것도 문제 파일이 아니다.
CONCEPTS_FILE = "concepts.yaml"
SET_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
# 폐기한 문제 ID와 폐기 이유. 폐기 번호 재사용 금지(guide.md ID 규칙)를 검증기가 강제한다.
RETIRED_IDS = {
    "sip-0036": "sip-0035와 같은 사실(100 Trying의 의미)을 같은 방향으로 반복",
    "diam-0010": "diam-0006과 같은 사실(LIR의 용도)을 같은 방향으로 반복",
}


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
            if qid in RETIRED_IDS:
                errors.append(f"[{loc}] 폐기된 id 재사용 금지 ({RETIRED_IDS[qid]})")
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
            # 따옴표 없는 숫자(answer: [300])는 YAML이 int로 읽어 브라우저 JS 비교가 깨지므로 거부.
            if not isinstance(answer, list) or len(answer) == 0 \
                    or not all(isinstance(a, str) and a.strip() for a in answer):
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
            # 같은 글자의 조각이 둘이면 화면에서 구분이 안 되는데 채점은 조각 번호로 해서 어긋난다.
            msgs = [str(it.get("msg", "")) for src in (items, decoys) if isinstance(src, list)
                    for it in src if isinstance(it, dict)]
            dup = sorted({m for m in msgs if msgs.count(m) > 1})
            if dup:
                errors.append(f"[{loc}] order items+decoys에 같은 msg 중복: {dup}")
            # direction(선택): false면 방향을 채점하지 않는다. 생략하면 방향도 채점(기존 동작).
            if "direction" in q and not isinstance(q["direction"], bool):
                errors.append(f"[{loc}] order direction이 불리언이 아님: {q['direction']!r}")
        elif qtype == "match":
            pairs = q.get("pairs")
            if not isinstance(pairs, list) \
                    or not (MATCH_MIN_PAIRS <= len(pairs) <= MATCH_MAX_PAIRS):
                errors.append(
                    f"[{loc}] match pairs가 {MATCH_MIN_PAIRS}~{MATCH_MAX_PAIRS}개 리스트가 아님"
                )
            else:
                _check_match_pairs(errors, loc, pairs)
        elif qtype == "steps":
            actors = q.get("actors")
            if actors is not None and (not isinstance(actors, list)
                                       or not all(str(a).strip() for a in actors)):
                errors.append(f"[{loc}] steps actors가 비어있지 않은 문자열 리스트가 아님")
                actors = None
            steps = q.get("steps")
            if not isinstance(steps, list) or len(steps) < 2:
                errors.append(f"[{loc}] steps가 없거나 2개 미만")
            else:
                _check_steps_items(errors, loc, "steps", steps, actors)
            decoys = q.get("decoys")
            if decoys is not None:
                if not isinstance(decoys, list) or len(decoys) == 0:
                    errors.append(f"[{loc}] steps decoys가 비어있지 않은 리스트가 아님")
                else:
                    # decoy는 레인에 없는 actor를 참조해도 됨(그려지지 않고 오답 보기로만 쓰임).
                    _check_steps_items(errors, loc, "decoys", decoys, None)
            # glossary(선택): 있으면 steps+decoys의 모든 act를 커버해야 함(찍기 방지 피드백 완성도).
            glossary = q.get("glossary")
            if glossary is not None:
                if not isinstance(glossary, dict):
                    errors.append(f"[{loc}] glossary가 매핑(dict)이 아님")
                else:
                    acts = set()
                    for src in (steps, decoys):
                        if isinstance(src, list):
                            for it in src:
                                if isinstance(it, dict) and str(it.get("act", "")).strip():
                                    acts.add(it["act"])
                    missing = sorted(a for a in acts if a not in glossary)
                    if missing:
                        errors.append(f"[{loc}] glossary에 누락된 act: {missing}")

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


MCQ_LONGEST_RATIO = 1.5
MCQ_LONGEST_MIN_LEN = 15


def lint(questions):
    """실패로 막지는 않지만 고치는 게 좋은 문제를 경고로 돌려준다."""
    warnings = []
    for q in questions:
        if q.get("type") != "mcq":
            continue
        choices, answer = q.get("choices"), q.get("answer")
        if not isinstance(choices, list) or not isinstance(answer, int) \
                or not (0 <= answer < len(choices)) or len(choices) < 2:
            continue
        lens = [len(str(c)) for c in choices]
        others = lens[:answer] + lens[answer + 1:]
        # 정답만 눈에 띄게 길면 내용을 몰라도 "가장 긴 보기"를 골라 맞힐 수 있다.
        # 보기가 이름·약어(ISC vs Gm, Record-Route vs Via)면 길이를 맞출 수 없고 단서도
        # 약하므로, 정답이 서술형(MCQ_LONGEST_MIN_LEN자 이상)일 때만 본다.
        if lens[answer] >= MCQ_LONGEST_MIN_LEN \
                and lens[answer] >= MCQ_LONGEST_RATIO * max(others):
            warnings.append(
                f"[{q.get('id')}] mcq 정답 보기가 다른 보기보다 {lens[answer] / max(others):.1f}배 김 "
                f"(정답 {lens[answer]}자, 가장 긴 오답 {max(others)}자) — 오답 길이를 맞출 것"
            )
    return warnings


def _check_match_pairs(errors, loc, pairs):
    # 같은 글자의 항목이 한 열에 둘 있으면 화면에서 구분할 수 없어 채점이 어긋난다.
    seen = {"left": set(), "right": set()}
    for i, p in enumerate(pairs):
        if not isinstance(p, dict):
            errors.append(f"[{loc}] pairs[{i}]가 매핑이 아님 (left/right 필요)")
            continue
        for key in ("left", "right"):
            v = p.get(key)
            if not isinstance(v, str) or not v.strip():
                errors.append(f"[{loc}] pairs[{i}].{key}가 비어있지 않은 문자열이 아님")
            elif v in seen[key]:
                errors.append(f"[{loc}] pairs[{i}].{key} '{v}' 중복")
            else:
                seen[key].add(v)


def _check_steps_items(errors, loc, field, items, actors):
    for i, item in enumerate(items):
        if not isinstance(item, dict):
            errors.append(f"[{loc}] {field}[{i}]가 매핑이 아님 (from/to/act 필요)")
            continue
        for key in ("from", "to", "act"):
            if not str(item.get(key, "")).strip():
                errors.append(f"[{loc}] {field}[{i}].{key} 비어있음")
        if item.get("from") and item.get("from") == item.get("to"):
            errors.append(f"[{loc}] {field}[{i}] from/to가 동일함")
        if actors is not None:
            for key in ("from", "to"):
                v = item.get(key)
                if v and v not in actors:
                    errors.append(
                        f"[{loc}] {field}[{i}].{key} '{v}'가 actors 레인 목록에 없음"
                    )


def question_files():
    """레포 루트의 문제 파일 목록. 세트·개념 정의 파일은 문제 파일이 아니라서 뺀다."""
    return [p for p in sorted(glob.glob("*.yaml")) if p not in (SETS_FILE, CONCEPTS_FILE)]


def load_sets(path=SETS_FILE):
    """세트(또는 개념 페이지) 정의 리스트를 읽는다. 파일이 없으면 빈 리스트."""
    try:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        return []
    except yaml.YAMLError as e:
        raise SystemExit(f"[{path}] YAML 파싱 오류:\n{e}")
    if data is None:
        return []
    if not isinstance(data, list):
        raise SystemExit(f"[{path}] 최상위는 리스트여야 함")
    return data


def validate_sets(sets, question_ids):
    """세트 정의를 검사하고 include를 풀어 [{id, name, ids}] 목록을 돌려준다.

    세트는 ids(문제 ID 목록)나 include(다른 세트 ID 목록) 중 하나 이상을 가진다.
    include는 한 단계만 허용한다(include로 묶인 세트는 다시 include를 쓸 수 없음).
    """
    errors = []
    by_id = {}
    for i, st in enumerate(sets):
        if not isinstance(st, dict):
            errors.append(f"[세트 #{i + 1}] 매핑(dict)이 아님: {st!r}")
            continue
        sid = st.get("id")
        loc = f"세트 {sid or '#' + str(i + 1)}"
        if not isinstance(sid, str) or not SET_ID_RE.match(sid):
            errors.append(f"[{loc}] id는 소문자·숫자·하이픈 문자열이어야 함 (예: csgn-paging)")
            continue
        if sid in by_id:
            errors.append(f"[{loc}] 세트 id 중복")
            continue
        by_id[sid] = st
        if not isinstance(st.get("name"), str) or not st["name"].strip():
            errors.append(f"[{loc}] name(화면에 보일 이름)이 비어 있음")
        unknown = set(st) - {"id", "name", "ids", "include"}
        if unknown:
            errors.append(f"[{loc}] 알 수 없는 필드: {sorted(unknown)}")
        if "ids" not in st and "include" not in st:
            errors.append(f"[{loc}] ids나 include 중 하나는 있어야 함")
        for field in ("ids", "include"):
            if field in st and (not isinstance(st[field], list) or not st[field]
                                or not all(isinstance(x, str) for x in st[field])):
                errors.append(f"[{loc}] {field}는 비어 있지 않은 문자열 리스트여야 함")
        for qid in st.get("ids") or []:
            if isinstance(qid, str) and qid not in question_ids:
                errors.append(f"[{loc}] 없는 문제 id: {qid}")
        ids = st.get("ids") or []
        dup = sorted({x for x in ids if ids.count(x) > 1})
        if dup:
            errors.append(f"[{loc}] ids 안에 중복: {dup}")

    resolved = []
    for sid, st in by_id.items():
        ids = list(st.get("ids") or [])
        for inc in st.get("include") or []:
            if inc not in by_id:
                errors.append(f"[세트 {sid}] include한 세트가 없음: {inc}")
            elif inc == sid or by_id[inc].get("include"):
                errors.append(f"[세트 {sid}] include는 한 단계만 허용 ({inc}는 자기 자신이거나 include를 가짐)")
            else:
                ids.extend(x for x in by_id[inc].get("ids") or [] if x not in ids)
        resolved.append({"id": sid, "name": st.get("name"), "ids": ids,
                         "include": list(st.get("include") or [])})
    return errors, resolved


def validate_concepts(pages, sets, questions):
    """개념 페이지 정의를 검사하고 {세트 id: [페이지, ...]}를 돌려준다.

    페이지는 세트 하나에 붙는다. include로 묶은 세트는 묶인 세트들의 페이지를 순서대로 보여준다.
    flows는 order/steps 문제 ID를 가리켜 그 정답 흐름을 그림으로 보여준다.
    """
    errors = []
    set_by_id = {st["id"]: st for st in sets}
    q_by_id = {q.get("id"): q for q in questions}
    by_set = {}
    for i, pg in enumerate(pages):
        if not isinstance(pg, dict):
            errors.append(f"[개념 #{i + 1}] 매핑(dict)이 아님: {pg!r}")
            continue
        sid = pg.get("set")
        loc = f"개념 {sid or '#' + str(i + 1)}"
        unknown = set(pg) - {"set", "summary", "flows", "terms"}
        if unknown:
            errors.append(f"[{loc}] 알 수 없는 필드: {sorted(unknown)}")
        if sid not in set_by_id:
            errors.append(f"[{loc}] sets.yaml에 없는 세트")
            continue
        if set_by_id[sid]["include"]:
            errors.append(f"[{loc}] include로 묶은 세트에는 직접 페이지를 달 수 없음(묶인 세트의 페이지를 보여줌)")
        if sid in by_set:
            errors.append(f"[{loc}] 같은 세트의 개념 페이지가 두 개")
        if not isinstance(pg.get("summary"), str) or not pg["summary"].strip():
            errors.append(f"[{loc}] summary가 비어 있음")
        for j, fl in enumerate(pg.get("flows") or []):
            if not isinstance(fl, dict) or set(fl) != {"id", "title", "notes"} or not all(
                    isinstance(fl[k], str) and fl[k].strip() for k in ("id", "title")):
                errors.append(f"[{loc}] flows[{j}]는 {{id, title, notes}} 매핑이어야 함")
                continue
            q = q_by_id.get(fl["id"])
            if not q or q.get("type") not in ("order", "steps"):
                errors.append(f"[{loc}] flows[{j}] {fl['id']}: 없는 문제이거나 order/steps가 아님")
                continue
            # 단계 설명은 그림의 화살표와 1:1이다. steps의 rt 단계는 요청·응답 화살표 2개로 그린다.
            if q["type"] == "order":
                n_rows = len(q.get("items") or [])
            else:
                n_rows = sum(2 if s.get("rt") else 1 for s in q.get("steps") or [])
            notes = fl["notes"]
            if not isinstance(notes, list) or not all(isinstance(x, str) and x.strip() for x in notes):
                errors.append(f"[{loc}] flows[{j}] notes는 비어 있지 않은 문자열 리스트여야 함")
            elif len(notes) != n_rows:
                errors.append(f"[{loc}] flows[{j}] {fl['id']}: notes {len(notes)}개, 화살표 {n_rows}개 — 개수가 같아야 함")
        terms = pg.get("terms")
        if not isinstance(terms, list) or not terms:
            errors.append(f"[{loc}] terms가 비어 있지 않은 리스트여야 함")
            terms = []
        seen = set()
        for j, t in enumerate(terms):
            tl = f"{loc} terms[{j}]"
            if not isinstance(t, dict):
                errors.append(f"[{tl}] 매핑(dict)이 아님")
                continue
            known = {"term", "full", "desc", "ref", "match"}
            if set(t) - known:
                errors.append(f"[{tl}] 알 수 없는 필드: {sorted(set(t) - known)}")
            if "match" in t and (not isinstance(t["match"], list) or not t["match"] or not all(
                    isinstance(m, str) and len(m.strip()) >= 2 for m in t["match"])):
                errors.append(f"[{tl}] match는 2글자 이상 문자열의 리스트여야 함")
            for k in ("term", "desc", "ref"):
                if not isinstance(t.get(k), str) or not t[k].strip():
                    errors.append(f"[{tl}] {k}가 비어 있음 (ref는 근거 조항, 필수)")
            if "full" in t and (not isinstance(t["full"], str) or not t["full"].strip()):
                errors.append(f"[{tl}] full이 비어 있음")
            if t.get("term") in seen:
                errors.append(f"[{tl}] 같은 페이지에 용어 중복: {t.get('term')}")
            seen.add(t.get("term"))
        by_set[sid] = pg

    resolved = {}
    for st in sets:
        members = st["include"] or [st["id"]]
        pgs = [dict(by_set[m], name=set_by_id[m]["name"]) for m in members if m in by_set]
        if pgs:
            resolved[st["id"]] = pgs
    return errors, resolved


def main():
    paths = sys.argv[1:] or question_files()
    if not paths:
        print("검증할 YAML 파일이 없습니다.")
        sys.exit(1)

    questions = load_yaml_files(paths)
    errors = validate(questions)
    set_errors, sets = validate_sets(load_sets(), {q.get("id") for q in questions})
    errors += set_errors
    concept_errors, concepts = validate_concepts(load_sets(CONCEPTS_FILE), sets, questions)
    errors += concept_errors

    if errors:
        print(f"검증 실패: {len(errors)}개 오류\n")
        for e in errors:
            print(" -", e)
        sys.exit(1)

    n_pages = len(load_sets(CONCEPTS_FILE))
    print(f"검증 통과: {len(questions)}개 문제, {len(paths)}개 파일, 세트 {len(sets)}개, 개념 페이지 {n_pages}개")
    warnings = lint(questions)
    if warnings:
        print(f"\n경고 {len(warnings)}개 (빌드는 막지 않음)")
        for w in warnings:
            print(" -", w)


if __name__ == "__main__":
    main()
