#!/usr/bin/env python3
"""YAML 문제파일 → 단일 self-contained HTML 변환기.

검증기(validator.py)를 먼저 통과시킨 뒤에만 HTML을 생성한다. 데이터는 HTML
안에 인라인하며(file:// 에서 fetch가 막히므로 외부 참조 없음), 셔플/출제
로직은 전부 브라우저 JS에서 런타임에 처리한다.
"""
import glob
import json
import sys

from validator import load_yaml_files, validate

TEMPLATE = r"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>SIP/Diameter 퀴즈</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f7;
    --fg: #1c1c1e;
    --card: #ffffff;
    --border: #d8d8dc;
    --muted: #6e6e73;
    --accent: #0a66c2;
    --accent-bg: #e6f0fa;
    --good-bg: #e4f7e9;
    --good-fg: #157a3d;
    --bad-bg: #fdeaea;
    --bad-fg: #b3221a;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #121214;
      --fg: #f2f2f4;
      --card: #1e1e21;
      --border: #3a3a3d;
      --muted: #9a9a9e;
      --accent: #4da3ff;
      --accent-bg: #142943;
      --good-bg: #123a20;
      --good-fg: #6fdb92;
      --bad-bg: #3a1414;
      --bad-fg: #ff8f87;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex;
    justify-content: center;
  }
  #app {
    width: 100%;
    max-width: 480px;
    padding: 16px;
    padding-bottom: 48px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    color: var(--muted);
    font-size: 13px;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 18px;
  }
  .badges { margin-bottom: 10px; }
  .badge {
    display: inline-block;
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 9px;
    margin-right: 6px;
  }
  .question {
    font-size: 17px;
    line-height: 1.5;
    white-space: pre-wrap;
    font-family: inherit;
    margin: 0 0 16px;
  }
  .question.raw {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 14px;
    background: var(--bg);
    padding: 10px;
    border-radius: 8px;
  }
  #answer-area {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .order-label {
    font-size: 12px;
    color: var(--muted);
  }
  .order-pool {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 8px;
    padding: 2px;
  }
  .order-answer {
    min-height: 44px;
    border: 1px dashed var(--border);
    border-radius: 10px;
    padding: 10px 10px 4px;
    background: var(--bg);
  }
  .order-placeholder {
    color: var(--muted);
    font-size: 14px;
    padding: 8px 2px 2px;
  }
  .order-reset {
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: none;
    text-align: right;
    padding: 4px;
    cursor: pointer;
  }
  button.opt {
    display: block;
    width: 100%;
    text-align: left;
    font-size: 16px;
    padding: 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }
  button.opt:active { opacity: 0.7; }
  button.opt.chip {
    display: inline-block;
    width: auto;
  }
  button.opt.correct { background: var(--good-bg); color: var(--good-fg); border-color: var(--good-fg); }
  button.opt.wrong { background: var(--bad-bg); color: var(--bad-fg); border-color: var(--bad-fg); }
  button.opt:disabled { cursor: default; opacity: 1; }
  .ox-row { display: flex; gap: 10px; }
  .ox-row button.opt { text-align: center; font-size: 22px; font-weight: 600; padding: 20px; }
  input[type=text] {
    width: 100%;
    font-size: 16px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    margin-bottom: 10px;
  }
  .primary {
    width: 100%;
    font-size: 16px;
    font-weight: 600;
    padding: 14px;
    border-radius: 10px;
    border: none;
    background: var(--accent);
    color: #fff;
    cursor: pointer;
  }
  .primary:disabled { opacity: 0.4; }
  .secondary {
    width: 100%;
    font-size: 14px;
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .feedback {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .feedback .verdict { font-weight: 700; margin-bottom: 8px; }
  .feedback .verdict.correct { color: var(--good-fg); }
  .feedback .verdict.wrong { color: var(--bad-fg); }
  .feedback .explain { white-space: pre-wrap; line-height: 1.5; margin: 0 0 10px; }
  .feedback .ref { font-size: 12px; color: var(--muted); margin: 0 0 16px; }
  .diagram { position: relative; margin: 4px 0 18px; font-size: 12px; }
  .diagram-header { position: relative; height: 30px; }
  .diagram-actor {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    white-space: nowrap;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px 10px;
    font-weight: 700;
    color: var(--fg);
  }
  .diagram-body { position: relative; }
  .diagram-lifeline {
    position: absolute;
    top: 0;
    bottom: 0;
    border-left: 1px dashed var(--muted);
  }
  .diagram-row { position: absolute; left: 0; right: 0; height: 44px; }
  .diagram-msg {
    position: absolute;
    top: 2px;
    text-align: center;
    color: var(--muted);
    background: var(--card);
    padding: 0 4px;
  }
  .diagram-line {
    position: absolute;
    top: 22px;
    height: 1px;
    background: var(--fg);
  }
  .diagram-line::after {
    content: "▶";
    position: absolute;
    top: -7px;
    right: -2px;
    font-size: 11px;
    line-height: 1;
  }
  .diagram-line.rev::after {
    content: "◀";
    right: auto;
    left: -2px;
  }
  .diagram-row.tappable { cursor: pointer; }
  .diagram-row.tappable .diagram-msg { color: var(--accent); }
  .diagram-row.tappable .diagram-line { background: var(--accent); }
  .diagram-row.tappable .diagram-line::after { color: var(--accent); }
  .diagram-row.tappable:active .diagram-msg,
  .diagram-row.tappable:active .diagram-line { opacity: 0.5; }
  footer { text-align: center; color: var(--muted); font-size: 12px; margin-top: 14px; }
  .start-title { font-size: 18px; font-weight: 700; margin-bottom: 16px; }
  .picker-group { margin-bottom: 18px; }
  .picker-label { font-size: 13px; color: var(--muted); margin-bottom: 8px; }
  .picker-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pick-btn {
    font-size: 15px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--fg);
    cursor: pointer;
  }
  .pick-btn.sel {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent);
    font-weight: 600;
  }
  .pick-count { font-size: 13px; color: var(--muted); margin: 4px 0 16px; }
  .linkbtn {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 13px;
    padding: 0;
    cursor: pointer;
  }
</style>
</head>
<body>
<div id="app">
  <header id="hdr" hidden>
    <button id="deck-change" class="linkbtn"></button>
    <span id="deck-label"></span>
  </header>
  <div id="start" class="card" hidden>
    <div class="start-title">덱 선택</div>
    <div id="topic-group" class="picker-group">
      <div class="picker-label">주제</div>
      <div id="pick-topic" class="picker-row"></div>
    </div>
    <div class="picker-group">
      <div class="picker-label">난이도</div>
      <div id="pick-diff" class="picker-row"></div>
    </div>
    <div id="mode-group" class="picker-group">
      <div class="picker-label">유형</div>
      <div id="pick-mode" class="picker-row"></div>
    </div>
    <div id="pick-count" class="pick-count"></div>
    <button id="start-btn" class="primary">시작</button>
  </div>
  <div id="quiz" class="card" hidden>
    <div id="badges" class="badges"></div>
    <div id="question" class="question"></div>
    <div id="answer-area"></div>
    <button id="pass-btn" class="secondary">모르겠음 (PASS)</button>
    <div id="feedback" class="feedback" hidden>
      <div id="verdict" class="verdict"></div>
      <div id="diagram"></div>
      <p id="explain" class="explain"></p>
      <p id="ref" class="ref"></p>
      <button id="next-btn" class="primary">다음 문제</button>
    </div>
  </div>
  <footer>상태 저장 없음 · 새로고침하면 처음부터</footer>
</div>

<script id="quiz-data" type="application/json">__QUIZ_DATA__</script>
<script>
(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("quiz-data").textContent);
  if (!DATA.length) {
    document.getElementById("app").textContent = "문제가 없습니다.";
    return;
  }

  var POOL = [];
  var deck = [];
  var current = null;
  var answered = false;
  var DIFF_LABEL = { basic: "기본", advanced: "심화" };
  var MODE_LABEL = { "__all__": "전체", order: "순서맞추기", noorder: "순서제외" };
  var sel = { topic: "__all__", difficulty: "__all__", mode: "__all__" };

  var elHdr = document.getElementById("hdr");
  var elDeckChange = document.getElementById("deck-change");
  var elStart = document.getElementById("start");
  var elQuiz = document.getElementById("quiz");
  var elTopicGroup = document.getElementById("topic-group");
  var elModeGroup = document.getElementById("mode-group");
  var elPickTopic = document.getElementById("pick-topic");
  var elPickDiff = document.getElementById("pick-diff");
  var elPickMode = document.getElementById("pick-mode");
  var elPickCount = document.getElementById("pick-count");
  var elStartBtn = document.getElementById("start-btn");
  var elDeckCount = document.getElementById("deck-label");
  var elBadges = document.getElementById("badges");
  var elQuestion = document.getElementById("question");
  var elAnswerArea = document.getElementById("answer-area");
  var elFeedback = document.getElementById("feedback");
  var elVerdict = document.getElementById("verdict");
  var elDiagram = document.getElementById("diagram");
  var elExplain = document.getElementById("explain");
  var elRef = document.getElementById("ref");
  var elNextBtn = document.getElementById("next-btn");
  var elPassBtn = document.getElementById("pass-btn");

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function nextQuestion() {
    if (deck.length === 0) deck = shuffle(POOL);
    return deck.pop();
  }

  function el(tag, opts) {
    var e = document.createElement(tag);
    opts = opts || {};
    if (opts.text !== undefined) e.textContent = opts.text;
    if (opts.cls) e.className = opts.cls;
    return e;
  }

  function looksRaw(text) {
    return text.indexOf("\n") !== -1;
  }

  function showFeedback(isCorrect, explain, ref, diagramNode) {
    answered = true;
    elPassBtn.hidden = true;
    elVerdict.textContent = isCorrect ? "정답" : "오답";
    elVerdict.className = "verdict " + (isCorrect ? "correct" : "wrong");
    elDiagram.innerHTML = "";
    if (diagramNode) elDiagram.appendChild(diagramNode);
    elExplain.textContent = explain;
    elRef.textContent = "ref: " + ref;
    elFeedback.hidden = false;
  }

  // 참가자 목록: q.items를 순서대로 훑으며 처음 등장하는 순서로 레인을 고정한다.
  function collectActors(items) {
    var actors = [];
    items.forEach(function (it) {
      if (actors.indexOf(it.from) === -1) actors.push(it.from);
      if (actors.indexOf(it.to) === -1) actors.push(it.to);
    });
    return actors;
  }

  // 이 문제의 정답에 실제로 등장하는 (from, to) 조합만. 방향 토글은 이 목록만 순환한다 —
  // actor를 전부 조합(N*(N-1))하면 참가자가 늘수록(HSS/EIR/OFCS 등) 실제로 안 쓰이는
  // 조합까지 순환에 끼어들어 탭 수만 늘어난다.
  function collectPairs(items) {
    var pairs = [];
    items.forEach(function (it) {
      var exists = pairs.some(function (p) { return p[0] === it.from && p[1] === it.to; });
      if (!exists) pairs.push([it.from, it.to]);
    });
    return pairs;
  }

  // 좌표(퍼센트)를 직접 계산해서 화살표가 항상 정확히 두 lifeline 사이에 걸치게 한다
  // (그리드 칸 경계에 맞추면 lifeline이 칸 "중앙"에 있어서 살짝 어긋난다).
  // actors: 참가자 목록(레인 순서 고정). rows: [{msg, from, to}, ...] 위에서부터 순서대로.
  // onRowClick(rowIndex)를 주면 각 줄이 탭 가능해진다(방향 전환용) — 안 주면 읽기 전용.
  var DIAGRAM_ROW_H = 44;

  function renderDiagram(actors, rows, onRowClick) {
    var n = actors.length;
    var xOf = function (i) { return (i + 0.5) / n * 100; };

    var wrap = el("div", { cls: "diagram" });

    var header = el("div", { cls: "diagram-header" });
    actors.forEach(function (a, i) {
      var box = el("div", { cls: "diagram-actor", text: a });
      box.style.left = xOf(i) + "%";
      header.appendChild(box);
    });
    wrap.appendChild(header);

    var body = el("div", { cls: "diagram-body" });
    body.style.height = (Math.max(rows.length, 1) * DIAGRAM_ROW_H + 10) + "px";

    actors.forEach(function (a, i) {
      var line = el("div", { cls: "diagram-lifeline" });
      line.style.left = xOf(i) + "%";
      body.appendChild(line);
    });

    rows.forEach(function (r, idx) {
      var fromIdx = actors.indexOf(r.from);
      var toIdx = actors.indexOf(r.to);
      var rev = toIdx < fromIdx;
      var x1 = xOf(Math.min(fromIdx, toIdx));
      var x2 = xOf(Math.max(fromIdx, toIdx));

      var row = el("div", { cls: "diagram-row" + (onRowClick ? " tappable" : "") });
      row.style.top = (idx * DIAGRAM_ROW_H) + "px";

      var msg = el("div", { cls: "diagram-msg", text: (idx + 1) + ". " + r.msg });
      msg.style.left = x1 + "%";
      msg.style.width = (x2 - x1) + "%";

      var line = el("div", { cls: "diagram-line" + (rev ? " rev" : "") });
      line.style.left = x1 + "%";
      line.style.width = (x2 - x1) + "%";

      row.appendChild(msg);
      row.appendChild(line);
      if (onRowClick) {
        row.addEventListener("click", function () { onRowClick(idx); });
      }
      body.appendChild(row);
    });

    wrap.appendChild(body);
    return wrap;
  }

  // 정답 순서/방향(q.items)을 읽기 전용 시퀀스 다이어그램으로 그린다. 채점 후 reveal에서만 쓴다.
  function buildDiagram(items) {
    return renderDiagram(collectActors(items), items, null);
  }

  function renderMcq(q) {
    var order = shuffle(q.choices.map(function (c, i) { return i; }));
    order.forEach(function (origIndex) {
      var btn = el("button", { cls: "opt", text: q.choices[origIndex] });
      btn.addEventListener("click", function () {
        if (answered) return;
        var isCorrect = origIndex === q.answer;
        btn.classList.add(isCorrect ? "correct" : "wrong");
        if (!isCorrect) {
          Array.prototype.forEach.call(elAnswerArea.children, function (b, i) {
            if (order[i] === q.answer) b.classList.add("correct");
          });
        }
        Array.prototype.forEach.call(elAnswerArea.children, function (b) { b.disabled = true; });
        showFeedback(isCorrect, q.explain, q.ref);
      });
      elAnswerArea.appendChild(btn);
    });
  }

  function renderOx(q) {
    var row = el("div", { cls: "ox-row" });
    [true, false].forEach(function (val) {
      var btn = el("button", { cls: "opt", text: val ? "O" : "X" });
      btn.addEventListener("click", function () {
        if (answered) return;
        var isCorrect = val === q.answer;
        btn.classList.add(isCorrect ? "correct" : "wrong");
        if (!isCorrect) {
          Array.prototype.forEach.call(row.children, function (b, i) {
            if ([true, false][i] === q.answer) b.classList.add("correct");
          });
        }
        Array.prototype.forEach.call(row.children, function (b) { b.disabled = true; });
        showFeedback(isCorrect, q.explain, q.ref);
      });
      row.appendChild(btn);
    });
    elAnswerArea.appendChild(row);
  }

  function renderShort(q) {
    var input = el("input");
    input.type = "text";
    input.autocapitalize = "off";
    input.autocomplete = "off";
    var submit = el("button", { cls: "primary", text: "확인" });
    submit.addEventListener("click", function () {
      if (answered) return;
      var given = input.value.trim().toLowerCase();
      var isCorrect = q.answer.some(function (a) { return a.trim().toLowerCase() === given; });
      input.disabled = true;
      submit.disabled = true;
      showFeedback(isCorrect, q.explain + "\n정답: " + q.answer[0], q.ref);
    });
    elAnswerArea.appendChild(input);
    elAnswerArea.appendChild(submit);
  }

  function renderOrder(q) {
    // uid == 정답 순서상의 인덱스(q.items 기준). 중복 문구가 있어도 안전하게 구분된다.
    var actors = collectActors(q.items);
    var pairs = collectPairs(q.items);
    var pool = shuffle(q.items.map(function (item, uid) { return { item: item, uid: uid }; }));
    var poolEl = el("div", { cls: "order-pool" });
    var answerEl = el("div", { cls: "order-answer" });
    // chosen[i] = { uid, item, pairIndex } — 탭한 순서대로. pairIndex는 무작위 초기값이라
    // 방향을 안 건드리면 자동으로 맞는 일이 없다.
    var chosen = [];

    function renderPool() {
      poolEl.innerHTML = "";
      pool.forEach(function (p) {
        if (chosen.some(function (c) { return c.uid === p.uid; })) return;
        var btn = el("button", { cls: "opt chip", text: p.item.msg });
        btn.addEventListener("click", function () {
          if (answered) return;
          chosen.push({ uid: p.uid, item: p.item, pairIndex: Math.floor(Math.random() * pairs.length) });
          renderPool();
          renderAnswer();
        });
        poolEl.appendChild(btn);
      });
    }

    function renderAnswer() {
      answerEl.innerHTML = "";
      var rows = chosen.map(function (entry) {
        var pair = pairs[entry.pairIndex];
        return { msg: entry.item.msg, from: pair[0], to: pair[1] };
      });
      answerEl.appendChild(renderDiagram(actors, rows, function (idx) {
        if (answered) return;
        chosen[idx].pairIndex = (chosen[idx].pairIndex + 1) % pairs.length;
        renderAnswer();
      }));
      if (chosen.length === 0) {
        answerEl.appendChild(el("div", {
          cls: "order-placeholder",
          text: "위에서 순서대로 탭 → 담긴 항목을 다시 탭하면 방향 전환"
        }));
      }
    }

    var resetBtn = el("button", { cls: "order-reset", text: "↺ 처음부터" });
    resetBtn.addEventListener("click", function () {
      if (answered) return;
      chosen = [];
      renderPool();
      renderAnswer();
    });

    var submit = el("button", { cls: "primary", text: "확인" });
    submit.addEventListener("click", function () {
      if (answered) return;
      if (chosen.length !== q.items.length) return;
      var isCorrect = chosen.every(function (entry, i) {
        var pair = pairs[entry.pairIndex];
        return entry.uid === i && pair[0] === entry.item.from && pair[1] === entry.item.to;
      });
      submit.disabled = true;
      showFeedback(isCorrect, q.explain, q.ref, buildDiagram(q.items));
    });

    renderPool();
    renderAnswer();

    elAnswerArea.appendChild(el("div", { cls: "order-label", text: "탭해서 순서대로 선택" }));
    elAnswerArea.appendChild(poolEl);
    elAnswerArea.appendChild(el("div", { cls: "order-label", text: "내 답안 (탭하면 방향 전환)" }));
    elAnswerArea.appendChild(answerEl);
    elAnswerArea.appendChild(resetBtn);
    elAnswerArea.appendChild(submit);
  }

  function render(q) {
    current = q;
    answered = false;
    elBadges.innerHTML = "";
    elBadges.appendChild(el("span", { cls: "badge", text: DIFF_LABEL[q.difficulty] || q.difficulty }));
    q.tags.forEach(function (t) {
      elBadges.appendChild(el("span", { cls: "badge", text: t }));
    });
    elDeckCount.textContent = "남은 " + deck.length + "문제";
    elQuestion.textContent = q.question;
    elQuestion.className = "question" + (looksRaw(q.question) ? " raw" : "");
    elAnswerArea.innerHTML = "";
    elFeedback.hidden = true;
    elPassBtn.hidden = false;

    if (q.type === "mcq") renderMcq(q);
    else if (q.type === "ox") renderOx(q);
    else if (q.type === "short") renderShort(q);
    else if (q.type === "order") renderOrder(q);
  }

  elNextBtn.addEventListener("click", function () {
    render(nextQuestion());
  });

  elPassBtn.addEventListener("click", function () {
    if (answered) return;
    render(nextQuestion());
  });

  // ---- 덱 선택 화면 ----
  // 선택지는 데이터에 실제 존재하는 값에서만 만든다. 없는 주제/난이도 버튼은 안 만든다.
  var topicVals = [];
  DATA.forEach(function (q) { if (topicVals.indexOf(q.topic) === -1) topicVals.push(q.topic); });
  var diffVals = ["basic", "advanced"].filter(function (d) {
    return DATA.some(function (q) { return q.difficulty === d; });
  });

  function matching() {
    return DATA.filter(function (q) {
      var modeOk = sel.mode === "__all__" ||
                   (sel.mode === "order" && q.type === "order") ||
                   (sel.mode === "noorder" && q.type !== "order");
      return (sel.topic === "__all__" || q.topic === sel.topic) &&
             (sel.difficulty === "__all__" || q.difficulty === sel.difficulty) &&
             modeOk;
    });
  }

  function makeRow(container, key, values, labelFn) {
    container.innerHTML = "";
    var opts = [{ v: "__all__", label: "전체" }];
    values.forEach(function (v) { opts.push({ v: v, label: labelFn(v) }); });
    opts.forEach(function (o) {
      var btn = el("button", { cls: "pick-btn" + (sel[key] === o.v ? " sel" : ""), text: o.label });
      btn.addEventListener("click", function () { sel[key] = o.v; refreshPicker(); });
      container.appendChild(btn);
    });
  }

  // 유형(순서맞추기)은 type 필드값 하나에 대응하지 않고 "order냐 아니냐"라 makeRow로 못 만든다.
  function makeModeRow() {
    elPickMode.innerHTML = "";
    ["__all__", "order", "noorder"].forEach(function (v) {
      var btn = el("button", { cls: "pick-btn" + (sel.mode === v ? " sel" : ""), text: MODE_LABEL[v] });
      btn.addEventListener("click", function () { sel.mode = v; refreshPicker(); });
      elPickMode.appendChild(btn);
    });
  }

  function refreshPicker() {
    makeRow(elPickTopic, "topic", topicVals, function (t) { return t; });
    makeRow(elPickDiff, "difficulty", diffVals, function (d) { return DIFF_LABEL[d] || d; });
    makeModeRow();
    var n = matching().length;
    elPickCount.textContent = n + "문제";
    elStartBtn.disabled = n === 0;
  }

  function filterLabel() {
    var parts = [sel.topic === "__all__" ? "전체" : sel.topic];
    parts.push(sel.difficulty === "__all__" ? "전체" : DIFF_LABEL[sel.difficulty]);
    if (sel.mode !== "__all__") parts.push(MODE_LABEL[sel.mode]);
    return parts.join(" · ") + " ▾";
  }

  function showStart() {
    elQuiz.hidden = true;
    elHdr.hidden = true;
    elFeedback.hidden = true;
    elStart.hidden = false;
    refreshPicker();
  }

  function startQuiz() {
    POOL = matching();
    if (!POOL.length) return;
    deck = [];
    elStart.hidden = true;
    elQuiz.hidden = false;
    elHdr.hidden = false;
    elDeckChange.textContent = filterLabel();
    render(nextQuestion());
  }

  elStartBtn.addEventListener("click", startQuiz);
  elDeckChange.addEventListener("click", showStart);

  // 주제가 하나뿐이면 '전체'와 중복이라 주제 선택 줄은 숨긴다.
  if (topicVals.length <= 1) elTopicGroup.hidden = true;
  // order 타입 문제가 없으면 유형 필터도 의미 없으니 숨긴다.
  if (!DATA.some(function (q) { return q.type === "order"; })) elModeGroup.hidden = true;

  showStart();
})();
</script>
</body>
</html>
"""


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
    html = TEMPLATE.replace("__QUIZ_DATA__", data_json)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"생성 완료: {out_path} ({len(clean)}문제, {len(paths)}개 파일)")


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
