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
  var TYPE_LABEL = { mcq: "객관식", ox: "O/X", short: "단답", order: "순서 나열", steps: "단계 완성", match: "짝맞추기" };
  var MODE_LABEL = { "__all__": "전체", quick: "짧은 문제", order: "순서 나열", steps: "단계 완성" };
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
    if (deck.length === 0) {
      deck = shuffle(POOL);
      // 새로 섞은 덱의 첫 문제가 방금 낸 문제면 덱 맨 뒤로 보낸다(덱 경계에서 연속 출제 방지).
      var last = deck.length - 1;
      if (last > 0 && deck[last] === current) {
        deck[last] = deck[0];
        deck[0] = current;
      }
    }
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

  // highlightStep(선택): r.stepIdx === highlightStep 인 화살표를 초록으로 강조(방금 확정한 단계).
  function renderDiagram(actors, rows, onRowClick, highlightStep) {
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

      var hl = (highlightStep != null && r.stepIdx === highlightStep) ? " hl" : "";
      var bad = r.bad ? " bad" : ""; // 채점 후 틀린 줄(order)을 빨갛게 표시.
      var row = el("div", { cls: "diagram-row" + (onRowClick ? " tappable" : "") + hl + bad });
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
    // actor가 많으면(4+) 폭을 확보하고, 폰에서 넘치면 가로 스크롤로 떨어지게 한다.
    if (n >= 4) wrap.style.minWidth = (n * 66) + "px";
    var scroller = el("div", { cls: "diagram-scroll" });
    scroller.appendChild(wrap);
    return scroller;
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

  // short 비교용 정규화: 대소문자와 모든 공백을 무시한다("Busy Here" = "busyhere").
  function normShort(s) { return String(s).toLowerCase().replace(/\s+/g, ""); }

  function renderShort(q) {
    var input = el("input");
    input.type = "text";
    input.autocapitalize = "off";
    input.autocomplete = "off";
    // iOS 자동 수정이 z9hG4bK 같은 입력을 다른 단어로 바꾸지 않게 끈다.
    input.setAttribute("autocorrect", "off");
    input.spellcheck = false;
    // 정답이 전부 숫자면 숫자 키패드를 띄운다.
    if (q.answer.every(function (a) { return /^\d+$/.test(String(a).trim()); })) {
      input.inputMode = "numeric";
    }
    var submit = el("button", { cls: "primary", text: "확인" });
    function grade() {
      if (answered) return;
      var given = normShort(input.value);
      if (!given) return; // 빈 입력은 채점하지 않는다. 모르면 PASS.
      var isCorrect = q.answer.some(function (a) { return normShort(a) === given; });
      input.disabled = true;
      submit.disabled = true;
      showFeedback(isCorrect, q.explain + "\n정답: " + q.answer[0], q.ref);
    }
    submit.addEventListener("click", grade);
    // 키보드의 return(Enter)으로도 제출한다.
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") grade(); });
    elAnswerArea.appendChild(input);
    elAnswerArea.appendChild(submit);
  }

  function renderOrder(q) {
    // uid: 정답 항목은 0..n-1(q.items 인덱스), decoy는 "d"+k. 채점은 uid===i(숫자)로 하므로
    // decoy(문자열 uid)를 하나라도 담으면 자동으로 오답이 된다.
    var decoys = q.decoys || [];
    // direction: false면 방향을 채점하지 않는다. 담긴 화살표는 각 조각의 원래 방향으로 그리고
    // 탭으로 방향을 바꾸는 기능도 끈다(자명한 방향을 맞추느라 탭만 늘어나는 것을 막음).
    var gradeDir = q.direction !== false;
    var layoutItems = q.items.concat(decoys); // 레인/방향 후보는 정답+decoy 모두에서 모은다.
    var actors = collectActors(layoutItems);
    var pairs = collectPairs(layoutItems);
    var poolItems = q.items.map(function (item, i) { return { item: item, uid: i }; })
      .concat(decoys.map(function (item, k) { return { item: item, uid: "d" + k }; }));
    var pool = shuffle(poolItems);
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

    // 담긴 i번째 조각이 정답 i번째와 같은지(gradeDir면 방향까지). 채점과 틀린 줄 표시에 같이 쓴다.
    function rowOk(entry, i) {
      if (entry.uid !== i) return false;
      if (!gradeDir) return true;
      var pair = pairs[entry.pairIndex];
      return pair[0] === entry.item.from && pair[1] === entry.item.to;
    }

    function renderAnswer() {
      answerEl.innerHTML = "";
      var rows = chosen.map(function (entry, i) {
        var bad = answered && !rowOk(entry, i);
        if (!gradeDir) return { msg: entry.item.msg, from: entry.item.from, to: entry.item.to, bad: bad };
        var pair = pairs[entry.pairIndex];
        return { msg: entry.item.msg, from: pair[0], to: pair[1], bad: bad };
      });
      answerEl.appendChild(renderDiagram(actors, rows, gradeDir && !answered ? function (idx) {
        if (answered) return;
        chosen[idx].pairIndex = (chosen[idx].pairIndex + 1) % pairs.length;
        renderAnswer();
      } : null));
      if (chosen.length === 0) {
        answerEl.appendChild(el("div", {
          cls: "order-placeholder",
          text: gradeDir ? "위에서 순서대로 탭 → 담긴 항목을 다시 탭하면 방향 전환"
                         : "위에서 순서대로 탭"
        }));
      }
    }

    var tools = el("div", { cls: "order-tools" });
    var undoBtn = el("button", { cls: "order-reset", text: "← 하나 취소" });
    undoBtn.addEventListener("click", function () {
      if (answered) return;
      chosen.pop();
      renderPool();
      renderAnswer();
    });
    var resetBtn = el("button", { cls: "order-reset", text: "↺ 처음부터" });
    resetBtn.addEventListener("click", function () {
      if (answered) return;
      chosen = [];
      renderPool();
      renderAnswer();
    });
    tools.appendChild(undoBtn);
    tools.appendChild(resetBtn);

    var answerLabel = el("div", {
      cls: "order-label", text: gradeDir ? "내 답안 (탭하면 방향 전환)" : "내 답안"
    });

    var submit = el("button", { cls: "primary", text: "확인" });
    submit.addEventListener("click", function () {
      if (answered) return;
      if (chosen.length === 0) return;
      // 정답: 담은 것이 정확히 q.items(개수·순서·방향)와 일치하고 decoy를 하나도 안 담음.
      var isCorrect = chosen.length === q.items.length && chosen.every(rowOk);
      submit.disabled = true;
      var key = el("div");
      key.appendChild(el("div", { cls: "order-label", text: "정답 흐름" }));
      key.appendChild(buildDiagram(q.items));
      showFeedback(isCorrect, q.explain, q.ref, key);
      // showFeedback이 answered를 세운 뒤 다시 그려야 틀린 줄이 표시된다.
      answerLabel.textContent = isCorrect ? "내 답안" : "내 답안 (빨간 줄이 틀린 위치)";
      tools.hidden = true;
      renderPool();
      renderAnswer();
    });

    renderPool();
    renderAnswer();

    var poolLabel = decoys.length
      ? "탭해서 순서대로 선택 (관련 없는 오답 조각이 섞여 있음)"
      : "탭해서 순서대로 선택";
    elAnswerArea.appendChild(el("div", { cls: "order-label", text: poolLabel }));
    elAnswerArea.appendChild(poolEl);
    elAnswerArea.appendChild(answerLabel);
    elAnswerArea.appendChild(answerEl);
    elAnswerArea.appendChild(tools);
    elAnswerArea.appendChild(submit);
  }

  // 절차-순서(steps): 각 단계가 {from,to,act} 화살표. 매 단계 "대상(from→to)"·"동작(act)"을
  // 각각 후보에서 골라 확인 → 그 커맨드의 풀네임·동작(용어사전 glossary)을 보여주고(맞든
  // 틀리든 학습), '다음 ▸'로 진행. 화살표는 정답 흐름으로 그려지며 쌓임(rt는 요청→·응답←
  // 두 화살표). 틀린 슬롯만 빨강 표시, 끝에 "정답 X/Y".
  function renderSteps(q) {
    var steps = q.steps;
    var extras = q.decoys || [];
    var laneActors = q.actors || collectActors(steps);
    var pairPool = [];
    var actPool = [];
    steps.concat(extras).forEach(function (s) {
      var pk = s.from + " → " + s.to;
      if (pairPool.indexOf(pk) === -1) pairPool.push(pk);
      if (actPool.indexOf(s.act) === -1) actPool.push(s.act);
    });
    var gloss = q.glossary || {};
    var k = 0, correct = 0;

    function optionsFor(pool, c) {
      var others = shuffle(pool.filter(function (x) { return x !== c; })).slice(0, 3);
      return shuffle(others.concat([c]));
    }

    // rt 단계는 요청(from→to)·응답(to→from) 두 화살표로. stepIdx로 방금 확정한 단계를 강조.
    function expandRows(nSteps) {
      var rows = [];
      for (var i = 0; i < nSteps; i++) {
        var s = steps[i];
        if (s.rt) {
          var parts = s.act.split("/");
          var reqL = parts[0];
          var ansL = parts.length > 1 ? parts.slice(1).join("/") : s.act;
          rows.push({ msg: reqL, from: s.from, to: s.to, stepIdx: i });
          rows.push({ msg: ansL, from: s.to, to: s.from, stepIdx: i });
        } else {
          rows.push({ msg: s.act, from: s.from, to: s.to, stepIdx: i });
        }
      }
      return rows;
    }

    function gradeLock(row, c, sel) {
      Array.prototype.forEach.call(row.children, function (b) {
        b.disabled = true; b.classList.remove("sel");
        if (b.textContent === c) b.classList.add("correct");
        else if (b.textContent === sel) b.classList.add("wrong");
      });
    }

    // 확인 후 표시하는 뜻 패널: 정답 대상·동작 + 커맨드 풀네임/동작(용어사전). 틀렸으면 왜 아닌지.
    function buildNote(cur, curPair, selPair, selAct) {
      var box = el("div", { cls: "step-note" });
      box.appendChild(el("div", { cls: "ok", text: "정답: [" + curPair + "]  " + cur.act }));
      if (gloss[cur.act]) box.appendChild(el("div", { cls: "full", text: gloss[cur.act] }));
      if (selAct !== cur.act) {
        var g = gloss[selAct] ? selAct + " = " + gloss[selAct] : selAct;
        box.appendChild(el("div", { cls: "miss", text: "✗ 고른 동작 " + g + " → 여기선 아님" }));
      }
      if (selPair !== curPair) {
        box.appendChild(el("div", { cls: "miss", text: "✗ 대상 정답은 " + curPair }));
      }
      return box;
    }

    function renderStep() {
      elAnswerArea.innerHTML = "";
      elAnswerArea.appendChild(el("div", {
        cls: "order-label", text: "지금까지 · 정답 " + correct + "/" + steps.length
      }));
      elAnswerArea.appendChild(renderDiagram(laneActors, expandRows(k), null, k - 1));

      var cur = steps[k];
      var curPair = cur.from + " → " + cur.to;
      var selPair = null, selAct = null;

      function makeRow(pool, c, onPick) {
        var row = el("div", { cls: "order-pool" });
        optionsFor(pool, c).forEach(function (v) {
          var b = el("button", { cls: "opt chip", text: v });
          b.addEventListener("click", function () {
            if (b.disabled) return;
            Array.prototype.forEach.call(row.children, function (x) { x.classList.remove("sel"); });
            b.classList.add("sel");
            onPick(v);
          });
          row.appendChild(b);
        });
        return row;
      }

      elAnswerArea.appendChild(el("div", { cls: "order-label", text: (k + 1) + "번째 — 대상(누가→누구)?" }));
      var pairRow = makeRow(pairPool, curPair, function (v) { selPair = v; refresh(); });
      elAnswerArea.appendChild(pairRow);

      elAnswerArea.appendChild(el("div", { cls: "order-label", text: "동작(무엇)?" }));
      var actRow = makeRow(actPool, cur.act, function (v) { selAct = v; refresh(); });
      elAnswerArea.appendChild(actRow);

      var submit = el("button", { cls: "primary", text: "확인" });
      submit.disabled = true;
      function refresh() { submit.disabled = !(selPair && selAct); }

      submit.addEventListener("click", function () {
        if (submit.disabled) return;
        gradeLock(pairRow, curPair, selPair);
        gradeLock(actRow, cur.act, selAct);
        if (selPair === curPair && selAct === cur.act) correct++;
        elAnswerArea.appendChild(buildNote(cur, curPair, selPair, selAct));
        submit.remove();
        var last = (k === steps.length - 1);
        var next = el("button", { cls: "primary", text: last ? "결과 보기" : "다음 ▸" });
        next.addEventListener("click", function () {
          k++;
          if (k < steps.length) renderStep();
          else showFeedback(correct === steps.length,
            "정답 " + correct + "/" + steps.length + "단계\n\n" + q.explain,
            q.ref, renderDiagram(laneActors, expandRows(steps.length), null, -1));
        });
        elAnswerArea.appendChild(next);
      });
      elAnswerArea.appendChild(submit);
    }

    renderStep();
  }

  // 짝맞추기(match): 왼쪽·오른쪽 열을 각각 섞어 보여준다. 한쪽 항목을 탭한 뒤 반대쪽 항목을
  // 탭하면 짝이 연결되고, 연결된 항목을 다시 탭하면 풀린다. 왼쪽 항목엔 A, B, … 표지를 붙이고
  // 연결된 오른쪽 항목에 같은 표지를 보여준다. 모든 짝이 맞아야 정답.
  function renderMatch(q) {
    var n = q.pairs.length;
    var idxs = q.pairs.map(function (p, i) { return i; });
    var leftOrder = shuffle(idxs);
    var rightOrder = shuffle(idxs);
    var link = {};      // link[왼쪽 pairs 인덱스] = 오른쪽 pairs 인덱스. 정답은 link[i] === i.
    var picked = null;  // { side: "L" | "R", idx }
    var graded = false;
    var colL = el("div", { cls: "match-col" });
    var colR = el("div", { cls: "match-col" });
    var grid = el("div", { cls: "match-grid" });
    grid.appendChild(colL);
    grid.appendChild(colR);
    var submit = el("button", { cls: "primary", text: "확인" });

    function mark(li) { return String.fromCharCode(65 + leftOrder.indexOf(li)); }
    function leftOf(ri) {
      for (var k in link) if (link[k] === ri) return +k;
      return -1;
    }

    function tap(side, idx) {
      if (graded) return;
      var linkedLeft = side === "L" ? (idx in link ? idx : -1) : leftOf(idx);
      if (linkedLeft !== -1) {
        delete link[linkedLeft];
        picked = null;
      } else if (picked && picked.side !== side) {
        if (side === "L") link[idx] = picked.idx; else link[picked.idx] = idx;
        picked = null;
      } else if (picked && picked.idx === idx) {
        picked = null;
      } else {
        picked = { side: side, idx: idx };
      }
      draw();
    }

    function item(side, idx, text, linked, ok) {
      var cls = "opt match-item";
      if (graded) cls += ok ? " correct" : " wrong";
      else {
        if (linked) cls += " linked";
        if (picked && picked.side === side && picked.idx === idx) cls += " sel";
      }
      var b = el("button", { cls: cls, text: text });
      b.disabled = graded;
      b.addEventListener("click", function () { tap(side, idx); });
      return b;
    }

    function draw() {
      colL.innerHTML = "";
      colR.innerHTML = "";
      leftOrder.forEach(function (li) {
        colL.appendChild(item("L", li, mark(li) + ". " + q.pairs[li].left, li in link, link[li] === li));
      });
      rightOrder.forEach(function (ri) {
        var l = leftOf(ri);
        var text = (l === -1 ? "" : "[" + mark(l) + "] ") + q.pairs[ri].right;
        colR.appendChild(item("R", ri, text, l !== -1, l === ri));
      });
      submit.disabled = graded || Object.keys(link).length < n;
    }

    submit.addEventListener("click", function () {
      if (submit.disabled) return;
      graded = true;
      draw();
      var isCorrect = idxs.every(function (i) { return link[i] === i; });
      var key = el("div", { cls: "step-note" });
      leftOrder.forEach(function (li) {
        key.appendChild(el("div", { text: mark(li) + ". " + q.pairs[li].left + " — " + q.pairs[li].right }));
      });
      showFeedback(isCorrect, q.explain, q.ref, key);
    });

    elAnswerArea.appendChild(el("div", {
      cls: "order-label", text: "한쪽을 탭한 뒤 반대쪽을 탭해 짝 연결 (다시 탭하면 해제)"
    }));
    elAnswerArea.appendChild(grid);
    elAnswerArea.appendChild(submit);
    draw();
  }

  function render(q) {
    current = q;
    answered = false;
    // 배지: 주제·유형·난이도 + 문제 ID(오류 제보 시 문제를 지목하는 용도). tags는 내부 분류용이라 안 보인다.
    elBadges.innerHTML = "";
    [q.topic, TYPE_LABEL[q.type] || q.type, DIFF_LABEL[q.difficulty] || q.difficulty].forEach(function (t) {
      elBadges.appendChild(el("span", { cls: "badge", text: t }));
    });
    elBadges.appendChild(el("span", { cls: "badge id", text: q.id }));
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
    else if (q.type === "steps") renderSteps(q);
    else if (q.type === "match") renderMatch(q);
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

  // 유형 필터: 푸는 시간이 비슷한 것끼리 묶는다. order·steps는 각각 따로, 나머지는 '짧은 문제'.
  function modeOf(q) {
    if (q.type === "order") return "order";
    if (q.type === "steps") return "steps";
    return "quick";
  }
  var modeVals = ["quick", "order", "steps"].filter(function (m) {
    return DATA.some(function (q) { return modeOf(q) === m; });
  });

  function matching() {
    return DATA.filter(function (q) {
      return (sel.topic === "__all__" || q.topic === sel.topic) &&
             (sel.difficulty === "__all__" || q.difficulty === sel.difficulty) &&
             (sel.mode === "__all__" || modeOf(q) === sel.mode);
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

  function refreshPicker() {
    makeRow(elPickTopic, "topic", topicVals, function (t) { return t; });
    makeRow(elPickDiff, "difficulty", diffVals, function (d) { return DIFF_LABEL[d] || d; });
    makeRow(elPickMode, "mode", modeVals, function (m) { return MODE_LABEL[m]; });
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
  // 유형 묶음이 하나뿐이면 '전체'와 중복이라 유형 선택 줄도 숨긴다.
  if (modeVals.length <= 1) elModeGroup.hidden = true;

  showStart();
})();
