(function () {
  "use strict";
  var DATA = JSON.parse(document.getElementById("quiz-data").textContent);
  // 문제 묶음(sets.yaml). 빌드 때 include를 풀어 [{id, name, ids}]로 넣어 둔다.
  var SETS = JSON.parse(document.getElementById("sets-data").textContent);
  // 세트별 개념 페이지(concepts.yaml). {세트 id: [{name, summary, flows, terms}, ...]}
  var CONCEPTS = JSON.parse(document.getElementById("concepts-data").textContent);
  if (!DATA.length) {
    document.getElementById("app").textContent = "문제가 없습니다.";
    return;
  }

  var POOL = [];
  var deck = [];
  var current = null;
  var answered = false;
  var DIFF_LABEL = { basic: "기본", advanced: "심화" };
  // 중요도: 3=★★★ 필수, 2=★★ 중요, 1=★ 참고. 선택 줄은 "이 등급 이상"으로 거른다.
  var IMP_STARS = { 3: "★★★", 2: "★★", 1: "★" };
  var IMP_NAME = { 3: "필수", 2: "중요", 1: "참고" };
  var IMP_LABEL = { "3": "★★★ 필수만", "2": "★★ 이상" };
  var TYPE_LABEL = { mcq: "객관식", ox: "O/X", short: "단답", order: "순서 나열", steps: "단계 완성", match: "짝맞추기", open: "주관식" };
  var MODE_LABEL = { "__all__": "전체", quick: "짧은 문제", order: "순서 나열", steps: "단계 완성" };
  var sel = { set: "__all__", topic: "__all__", difficulty: "__all__", importance: "__all__", mode: "__all__",
              open: "include" };
  // 주관식(open) 포함 여부. 포함은 유형이 '전체'일 때 섞여 나오고, 주관식만은 유형 선택과 상관없이 주관식만 낸다.
  var OPEN_LABEL = { include: "포함", exclude: "빼기", only: "주관식만" };

  var elHdr = document.getElementById("hdr");
  var elDeckChange = document.getElementById("deck-change");
  var elStart = document.getElementById("start");
  var elQuiz = document.getElementById("quiz");
  var elSetGroup = document.getElementById("set-group");
  var elPickSet = document.getElementById("pick-set");
  var elTopicGroup = document.getElementById("topic-group");
  var elModeGroup = document.getElementById("mode-group");
  var elPickTopic = document.getElementById("pick-topic");
  var elPickDiff = document.getElementById("pick-diff");
  var elPickImp = document.getElementById("pick-imp");
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
  var elConcept = document.getElementById("concept");
  var elConceptBtn = document.getElementById("concept-btn");
  var elConceptBody = document.getElementById("concept-body");
  var elConceptBack = document.getElementById("concept-back");
  var elConceptStart = document.getElementById("concept-start");

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
    // isCorrect가 null이면 PASS로 정답만 확인하는 경우다(채점하지 않음).
    elVerdict.textContent = isCorrect === null ? "PASS · 채점하지 않음" : (isCorrect ? "정답" : "오답");
    elVerdict.className = "verdict " + (isCorrect === null ? "pass" : (isCorrect ? "correct" : "wrong"));
    elDiagram.innerHTML = "";
    if (diagramNode) elDiagram.appendChild(diagramNode);
    elExplain.textContent = explain;
    elRef.textContent = "ref: " + ref;
    elFeedback.hidden = false;
  }

  // 참가자(장비) 레인 순서. 모든 다이어그램에서 같은 장비가 같은 쪽에 오도록 ACTOR_ORDER
  // (validator.py, 단말 쪽 왼쪽 → 서버·외부망 오른쪽)로 정렬한다. 목록에 없는 참가자는
  // 오른쪽 끝에 처음 등장한 순서로 놓는다.
  var ACTOR_ORDER = JSON.parse(document.getElementById("actor-order").textContent);
  function collectActors(items) {
    var actors = [];
    items.forEach(function (it) {
      if (actors.indexOf(it.from) === -1) actors.push(it.from);
      if (actors.indexOf(it.to) === -1) actors.push(it.to);
    });
    function rank(a) {
      var r = ACTOR_ORDER.indexOf(a);
      return r === -1 ? ACTOR_ORDER.length + actors.indexOf(a) : r;
    }
    return actors.slice().sort(function (a, b) { return rank(a) - rank(b); });
  }

  // steps의 앞 nSteps 단계를 다이어그램 행으로 바꾼다. rt 단계는 요청(from→to)·응답(to→from)
  // 두 화살표로 펼치고 act를 '/'로 나눠 라벨을 붙인다. stepIdx로 어느 단계의 화살표인지 표시한다.
  function expandStepRows(steps, nSteps) {
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

    // 행은 위에서부터 차례로 쌓는다(라벨 → 화살표). 라벨이 여러 줄이면 그 행만 높아져서 겹치지 않는다.
    var body = el("div", { cls: "diagram-body" });

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

      var msg = el("div", { cls: "diagram-msg", text: (idx + 1) + ". " + r.msg });
      msg.style.marginLeft = x1 + "%";
      msg.style.width = (x2 - x1) + "%";

      var line = el("div", { cls: "diagram-line" + (rev ? " rev" : "") });
      line.style.marginLeft = x1 + "%";
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

  // ---- 주관식 (open) ----
  // 직접 써 본 뒤 [정답 보기]로 모범 답안과 핵심 요소를 보고, 내 답에 들어간 요소를 체크해 자가 채점한다.
  // 어디서나(GitHub Pages 포함) 동작한다. claude.ai 게시본에서 claude.use("sample")이 함수를 주면
  // [Claude 채점] 버튼이 추가로 나온다. Claude는 모범 답안·핵심 요소·해설만 근거로 채점한다.
  var SAMPLE = null;
  var openCtl = null; // 진행 중인 Claude 채점. PASS나 다음 문제로 넘어가면 취소한다.
  var elPickOpen = document.getElementById("pick-open");
  if (window.claude && typeof window.claude.use === "function") {
    window.claude.use("sample").then(function (fn) { if (fn) SAMPLE = fn; }, function () {});
  }

  function gradingPrompt(q, answer) {
    return [
      "너는 통신 프로토콜(SIP·Diameter·IMS·EPC) 학습 퀴즈의 채점자다.",
      "아래 [모범 답안]·[핵심 요소]·[해설]만 근거로 [학습자 답]을 채점하라.",
      "규칙:",
      "- 모범 답안과 해설에 없는 사실로 판단하지 않는다. 네가 아는 다른 지식으로 모범 답안을 바꾸지 않는다.",
      "- 표현이 달라도 뜻이 같으면 맞은 것으로 본다. 약어와 풀네임, 한글과 영어 표기, 띄어쓰기 차이는 무시한다.",
      "- 핵심 요소를 모두 담았으면 correct, 일부만 담았거나 일부가 틀리면 partial, 핵심이 없거나 틀리면 wrong.",
      "- feedback은 한국어 2~4문장. 맞은 점, 빠진 핵심 요소, 틀린 점을 구체적으로 학습자에게 말하듯 쓴다.",
      '다른 말 없이 JSON 하나로만 답하라: {"verdict": "correct" 또는 "partial" 또는 "wrong", "feedback": "..."}',
      "",
      "[문제]", q.question,
      "", "[모범 답안]", q.answer,
      "", "[핵심 요소]", q.points.map(function (p, i) { return (i + 1) + ". " + p; }).join("\n"),
      "", "[해설]", q.explain,
      "", "[학습자 답]", answer
    ].join("\n");
  }

  var GRADE_ERROR = {
    not_granted: "Claude 사용을 허용하지 않아 채점할 수 없습니다. [정답 보기]로 직접 채점하세요.",
    sampling_disabled: "이 계정에서는 Claude 채점을 쓸 수 없습니다. [정답 보기]로 직접 채점하세요.",
    rate_limited: "채점 요청이 많거나 사용량 한도에 닿았습니다. 잠시 뒤에 다시 눌러 주세요.",
    session_expired: "claude.ai 로그인이 만료되었습니다. 다시 로그인한 뒤 눌러 주세요.",
    invalid_json: "채점 결과를 읽지 못했습니다. 한 번 더 눌러 주세요.",
    refused: "Claude가 이 답을 채점하지 않았습니다. 답을 고쳐서 다시 눌러 주세요."
  };

  // 모범 답안 + 핵심 요소. PASS·문제 목록에서도 쓴다.
  function modelAnswerNode(q) {
    var box = el("div");
    box.appendChild(el("div", { cls: "order-label", text: "모범 답안" }));
    box.appendChild(proseNode(q.answer, "model-answer", false));
    box.appendChild(el("div", { cls: "order-label", text: "핵심 요소" }));
    var ul = el("ul", { cls: "point-list" });
    q.points.forEach(function (p) { ul.appendChild(el("li", { text: p })); });
    box.appendChild(ul);
    return box;
  }

  // 자가 채점: 내 답과 모범 답안을 나란히 보여주고, 핵심 요소마다 체크해 몇 개를 담았는지 센다.
  function selfCheckNode(q, mine) {
    var box = el("div");
    box.appendChild(el("div", { cls: "order-label", text: "내 답" }));
    box.appendChild(el("div", { cls: "my-answer", text: mine || "(쓰지 않고 머릿속으로 답함)" }));
    box.appendChild(el("div", { cls: "order-label", text: "모범 답안" }));
    box.appendChild(proseNode(q.answer, "model-answer", false));
    box.appendChild(el("div", { cls: "order-label", text: "핵심 요소 — 내 답에 들어간 것을 체크하세요" }));
    var list = el("div", { cls: "point-check" });
    var boxes = [];
    q.points.forEach(function (p, i) {
      var row = el("label", { cls: "point-row" });
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.id = "pt-" + q.id + "-" + i;
      cb.addEventListener("change", update);
      boxes.push(cb);
      row.appendChild(cb);
      row.appendChild(el("span", { text: p }));
      list.appendChild(row);
    });
    box.appendChild(list);
    function update() {
      var n = boxes.filter(function (b) { return b.checked; }).length;
      var m = boxes.length;
      elVerdict.textContent = "자가 채점 · 핵심 " + n + "/" + m + (n === m ? " · 정답" : n > 0 ? " · 일부 정답" : "");
      elVerdict.className = "verdict " + (n === m ? "correct" : n > 0 ? "partial" : "pass");
    }
    return box;
  }

  function renderOpen(q) {
    elAnswerArea.appendChild(el("div", { cls: "order-label", text: "직접 써 보세요. 다 쓰면 [정답 보기]로 모범 답안과 비교합니다." }));
    var input = el("textarea", { cls: "open-input" });
    input.id = "open-answer";
    input.rows = 6;
    input.placeholder = "생각나는 대로 써 보세요. 비워 두고 머릿속으로 답한 뒤 [정답 보기]를 눌러도 됩니다.";
    elAnswerArea.appendChild(input);
    var status = el("div", { cls: "open-status" });
    var reveal = el("button", { cls: "primary", text: "정답 보기" });
    reveal.addEventListener("click", function () {
      if (answered) return;
      if (openCtl) { openCtl.abort(); openCtl = null; }
      input.readOnly = true;
      showFeedback(null, q.explain, q.ref, selfCheckNode(q, input.value.trim()));
      elVerdict.textContent = "자가 채점 · 핵심 요소를 체크하세요";
      elVerdict.className = "verdict pass";
      reveal.disabled = true;
      if (claudeBtn) claudeBtn.disabled = true;
    });
    elAnswerArea.appendChild(status);
    elAnswerArea.appendChild(reveal);

    var claudeBtn = null;
    if (SAMPLE) {
      claudeBtn = el("button", { cls: "secondary open-claude", text: "Claude 채점" });
      var cancel = el("button", { cls: "linkbtn open-cancel", text: "채점 취소" });
      cancel.hidden = true;
      cancel.addEventListener("click", function () { if (openCtl) openCtl.abort(); });
      claudeBtn.addEventListener("click", function () {
        var answer = input.value.trim();
        if (answered || claudeBtn.disabled) return;
        if (!answer) { status.textContent = "Claude 채점은 답을 쓴 뒤에 누르세요."; return; }
        claudeBtn.disabled = true;
        input.readOnly = true;
        cancel.hidden = false;
        status.textContent = "채점 중입니다. 처음 한 번은 Claude 사용을 허용할지 묻습니다.";
        var ctl = openCtl = new AbortController();
        SAMPLE.json(gradingPrompt(q, answer), { signal: ctl.signal, modelTier: "default", effort: "low" })
          .then(function (res) {
            if (answered || openCtl !== ctl) return; // 이미 정답 보기·PASS·다음 문제로 넘어감
            openCtl = null;
            var v = res && res.verdict;
            if (v !== "correct" && v !== "partial" && v !== "wrong") throw { code: "invalid_json" };
            status.textContent = "";
            cancel.hidden = true;
            reveal.disabled = true;
            var key = el("div");
            var fb = el("div", { cls: "grade-box " + v });
            fb.appendChild(el("div", { cls: "grade-head", text: "Claude 채점" }));
            fb.appendChild(el("div", { text: String(res.feedback || "") }));
            key.appendChild(fb);
            key.appendChild(modelAnswerNode(q));
            showFeedback(v === "correct", q.explain, q.ref, key);
            if (v === "partial") {
              elVerdict.textContent = "일부 정답";
              elVerdict.className = "verdict partial";
            }
          })
          .catch(function (e) {
            if (answered || openCtl !== ctl) return;
            openCtl = null;
            cancel.hidden = true;
            claudeBtn.disabled = false;
            input.readOnly = false;
            var code = e && e.code;
            status.textContent = code === "cancelled" ? "" : (GRADE_ERROR[code] || "채점 중 연결이 끊겼습니다. 다시 눌러 주세요.");
          });
      });
      elAnswerArea.appendChild(claudeBtn);
      elAnswerArea.appendChild(cancel);
    }
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

    // rt 단계는 요청·응답 두 화살표로. stepIdx로 방금 확정한 단계를 강조.
    function expandRows(nSteps) { return expandStepRows(steps, nSteps); }

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
    if (openCtl) { openCtl.abort(); openCtl = null; }
    current = q;
    answered = false;
    // 배지: 주제·유형·난이도 + 문제 ID(오류 제보 시 문제를 지목하는 용도). tags는 내부 분류용이라 안 보인다.
    elBadges.innerHTML = "";
    [q.topic, TYPE_LABEL[q.type] || q.type, DIFF_LABEL[q.difficulty] || q.difficulty].forEach(function (t) {
      elBadges.appendChild(el("span", { cls: "badge", text: t }));
    });
    elBadges.appendChild(el("span", { cls: "badge id", text: q.id }));
    elDeckCount.textContent = "남은 " + deck.length + "문제";
    fillQuestion(q);
    hideTermPop();
    elQuestion.className = "question" + (looksRaw(q.question) ? " raw" : "");
    elAnswerArea.innerHTML = "";
    elFeedback.hidden = true;
    elPassBtn.hidden = false;

    if (q.type === "open") renderOpen(q);
    else if (q.type === "mcq") renderMcq(q);
    else if (q.type === "ox") renderOx(q);
    else if (q.type === "short") renderShort(q);
    else if (q.type === "order") renderOrder(q);
    else if (q.type === "steps") renderSteps(q);
    else if (q.type === "match") renderMatch(q);
  }

  elNextBtn.addEventListener("click", function () {
    render(nextQuestion());
  });

  // PASS: 채점하지 않고 정답과 해설을 보여준다. 몰라서 찍는 대신 정답을 보고 배우게 한다.
  // 풀던 답안은 지운다(틀린 답안이 화면에 남아 오답으로 기억되지 않게).
  function answerNode(q) {
    if (q.type === "mcq") return el("div", { cls: "step-note", text: "정답: " + q.choices[q.answer] });
    if (q.type === "ox") return el("div", { cls: "step-note", text: "정답: " + (q.answer ? "O" : "X") });
    if (q.type === "short") return el("div", { cls: "step-note", text: "정답: " + q.answer.join(" / ") });
    if (q.type === "open") return modelAnswerNode(q);
    var key = el("div");
    if (q.type === "order") {
      key.appendChild(el("div", { cls: "order-label", text: "정답 흐름" }));
      key.appendChild(buildDiagram(q.items));
    } else if (q.type === "steps") {
      key.appendChild(el("div", { cls: "order-label", text: "정답 흐름" }));
      key.appendChild(renderDiagram(q.actors || collectActors(q.steps), expandStepRows(q.steps, q.steps.length), null));
    } else if (q.type === "match") {
      key.className = "step-note";
      q.pairs.forEach(function (p) { key.appendChild(el("div", { text: p.left + " — " + p.right })); });
    }
    return key;
  }

  elPassBtn.addEventListener("click", function () {
    if (answered) return;
    if (openCtl) { openCtl.abort(); openCtl = null; }
    elAnswerArea.innerHTML = "";
    hideTermPop();
    showFeedback(null, current.explain, current.ref, answerNode(current));
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
    if (q.type === "open") return "open";
    if (q.type === "order") return "order";
    if (q.type === "steps") return "steps";
    return "quick";
  }
  var modeVals = ["quick", "order", "steps"].filter(function (m) {
    return DATA.some(function (q) { return modeOf(q) === m; });
  });

  var setById = {};
  SETS.forEach(function (s) { setById[s.id] = s; });

  // 주관식 포함 여부와 유형 선택을 함께 본다. 주관식만이면 유형 선택은 무시한다.
  function openOk(q) {
    var isOpen = q.type === "open";
    if (sel.open === "only") return isOpen;
    if (sel.open === "exclude" && isOpen) return false;
    return sel.mode === "__all__" || modeOf(q) === sel.mode;
  }

  function matching() {
    var inSet = sel.set === "__all__" ? null : setById[sel.set].ids;
    return DATA.filter(function (q) {
      return (!inSet || inSet.indexOf(q.id) !== -1) &&
             (sel.topic === "__all__" || q.topic === sel.topic) &&
             (sel.difficulty === "__all__" || q.difficulty === sel.difficulty) &&
             (sel.importance === "__all__" || q.importance >= Number(sel.importance)) &&
             openOk(q);
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
    // 주관식 줄: '전체' 없이 세 값만. makeRow는 '전체'를 앞에 붙이므로 직접 만든다.
    elPickOpen.innerHTML = "";
    ["include", "exclude", "only"].forEach(function (v) {
      var btn = el("button", { cls: "pick-btn" + (sel.open === v ? " sel" : ""), text: OPEN_LABEL[v] });
      btn.addEventListener("click", function () { sel.open = v; refreshPicker(); });
      elPickOpen.appendChild(btn);
    });
    makeRow(elPickSet, "set", SETS.map(function (s) { return s.id; }), function (id) { return setById[id].name; });
    makeRow(elPickTopic, "topic", topicVals, function (t) { return t; });
    makeRow(elPickDiff, "difficulty", diffVals, function (d) { return DIFF_LABEL[d] || d; });
    makeRow(elPickImp, "importance", ["3", "2"], function (v) { return IMP_LABEL[v]; });
    makeRow(elPickMode, "mode", modeVals, function (m) { return MODE_LABEL[m]; });
    var n = matching().length;
    elPickCount.textContent = n + "문제";
    elConceptBtn.hidden = !(sel.set !== "__all__" && CONCEPTS[sel.set]);
    elStartBtn.disabled = n === 0;
  }

  function filterLabel() {
    var parts = sel.set === "__all__" ? [] : [setById[sel.set].name];
    parts.push(sel.topic === "__all__" ? "전체" : sel.topic);
    parts.push(sel.difficulty === "__all__" ? "전체" : DIFF_LABEL[sel.difficulty]);
    if (sel.importance !== "__all__") parts.push(IMP_LABEL[sel.importance]);
    if (sel.open !== "include") parts.push(sel.open === "only" ? "주관식만" : "주관식 빼기");
    if (sel.mode !== "__all__") parts.push(MODE_LABEL[sel.mode]);
    return parts.join(" · ") + " ▾";
  }

  // ---- 용어 탭 ----
  // 개념 페이지(concepts.yaml)의 용어가 문제 문장에 나오면 밑줄을 긋고, 탭하면 뜻을 띄운다.
  // 정답이 드러나지 않게 O/X 문제는 밑줄을 긋지 않고, mcq/short는 정답과 관련된 용어를 뺀다.
  var GLOSS = [];   // 용어 항목(중복 제거)
  var TERM_KEYS = []; // [{low, entry}] 긴 문자열부터
  (function () {
    var seen = {};
    Object.keys(CONCEPTS).forEach(function (sid) {
      CONCEPTS[sid].forEach(function (pg) {
        pg.terms.forEach(function (t) {
          if (seen[t.term]) return;
          seen[t.term] = true;
          GLOSS.push(t);
          var keys = t.match || t.term.split(/\s*[\/·]\s*/).concat(t.full ? [t.full] : []);
          keys.forEach(function (k) {
            if (k.length >= 2) TERM_KEYS.push({ low: k.toLowerCase(), entry: t });
          });
        });
      });
    });
    TERM_KEYS.sort(function (a, b) { return b.low.length - a.low.length; });
  })();

  var WORD_CH = /[A-Za-z0-9-]/;
  // text 안의 용어 위치를 앞에서부터 겹치지 않게 찾는다. 영문·숫자·하이픈이 바로 붙어 있으면
  // 용어가 아니다(예: "TA"는 "TAU" 안에서 찾지 않는다). 대소문자는 무시한다.
  function findTerms(text) {
    var low = text.toLowerCase(), out = [], i = 0;
    while (i < text.length) {
      var hit = null;
      if (i === 0 || !WORD_CH.test(text[i - 1])) {
        for (var k = 0; k < TERM_KEYS.length; k++) {
          var t = TERM_KEYS[k];
          var after = text[i + t.low.length];
          if (low.substr(i, t.low.length) === t.low && (after === undefined || !WORD_CH.test(after))) {
            hit = t;
            break;
          }
        }
      }
      if (hit) {
        out.push({ start: i, end: i + hit.low.length, entry: hit.entry });
        i += hit.low.length;
      } else {
        i++;
      }
    }
    return out;
  }

  function normText(s) { return s.toLowerCase().replace(/[\s()·,.\/\-:'"]/g, ""); }

  // 정답이 드러날 수 있는 용어 항목. 정답 문구에 나온 용어, 그 용어를 설명에서 언급하는 용어,
  // 설명이 정답 문구와 5글자 이상 겹치는 용어를 뺀다.
  function spoilerEntries(q) {
    var ans = q.type === "mcq" ? q.choices[q.answer]
            : q.type === "short" ? q.answer.join(" ")
            : q.type === "open" ? q.answer + " " + q.points.join(" ") : null;
    if (ans === null) return [];
    var inAns = findTerms(ans).map(function (h) { return h.entry; });
    var na = normText(ans);
    return GLOSS.filter(function (e) {
      if (inAns.indexOf(e) !== -1) return true;
      // 팝업에 보이는 글(뜻·풀네임·예시) 전체를 정답과 비교한다.
      var shown = e.desc + " " + (e.when || "");
      if (findTerms(shown).some(function (h) { return inAns.indexOf(h.entry) !== -1; })) return true;
      var nd = normText(shown + " " + (e.full || ""));
      for (var i = 0; i + 5 <= na.length; i++) {
        if (nd.indexOf(na.substr(i, 5)) !== -1) return true;
      }
      return false;
    });
  }

  var elTermPop = document.getElementById("term-pop");
  function hideTermPop() { elTermPop.hidden = true; }
  function showTermPop(t) {
    elTermPop.innerHTML = "";
    var head = el("div", { cls: "term-pop-head", text: t.term });
    if (t.full) head.appendChild(el("span", { cls: "term-full", text: t.full }));
    elTermPop.appendChild(head);
    elTermPop.appendChild(el("div", { text: t.desc }));
    if (t.when) elTermPop.appendChild(el("div", { cls: "term-when", text: "예: " + t.when }));
    elTermPop.appendChild(el("div", { cls: "term-ref", text: t.ref + " · 탭하면 닫힘" }));
    elTermPop.hidden = false;
  }
  elTermPop.addEventListener("click", hideTermPop);

  function fillQuestion(q) {
    elQuestion.textContent = "";
    var text = q.question;
    if (q.type === "ox") { elQuestion.textContent = text; return; }
    var banned = spoilerEntries(q);
    var pos = 0;
    findTerms(text).forEach(function (h) {
      if (banned.indexOf(h.entry) !== -1) return;
      elQuestion.appendChild(document.createTextNode(text.slice(pos, h.start)));
      var span = el("span", { cls: "term-link", text: text.slice(h.start, h.end) });
      span.addEventListener("click", function (ev) { ev.stopPropagation(); showTermPop(h.entry); });
      elQuestion.appendChild(span);
      pos = h.end;
    });
    elQuestion.appendChild(document.createTextNode(text.slice(pos)));
  }

  // ---- 개념 페이지 글 가독성 ----
  // 문장 단위로 끊는다. summary는 한 줄에 한 문장이고, 단계 설명·용어 뜻은 "~다." 뒤에서 끊는다.
  function sentences(text) {
    return text.trim().replace(/다\.\s+/g, "다.\n").split("\n").filter(function (x) { return x.trim(); });
  }

  // 용어집에 있는 용어를 굵게 표시하고, 탭하면 뜻 팝업을 띄운다(개념 페이지는 정답 노출 걱정이 없다).
  function richNode(tag, cls, text) {
    var node = el(tag, { cls: cls });
    var pos = 0;
    findTerms(text).forEach(function (h) {
      node.appendChild(document.createTextNode(text.slice(pos, h.start)));
      var kw = el("b", { cls: "kw", text: text.slice(h.start, h.end) });
      kw.addEventListener("click", function (ev) { ev.stopPropagation(); showTermPop(h.entry); });
      node.appendChild(kw);
      pos = h.end;
    });
    node.appendChild(document.createTextNode(text.slice(pos)));
    return node;
  }

  // 문장마다 한 문단. 첫 문장을 리드로 강조하고 나머지는 목록으로 보여주는 형태(lead)도 지원한다.
  function proseNode(text, cls, lead) {
    var box = el("div", { cls: "prose " + cls });
    var ss = sentences(text);
    if (lead && ss.length > 1) {
      box.appendChild(richNode("p", "prose-lead", ss[0]));
      var ul = el("ul", { cls: "prose-list" });
      ss.slice(1).forEach(function (x) { ul.appendChild(richNode("li", "", x)); });
      box.appendChild(ul);
    } else {
      ss.forEach(function (x) { box.appendChild(richNode("p", "", x)); });
    }
    return box;
  }

  // ---- 개념 페이지 ----
  // 세트를 고른 뒤 퀴즈 전에 읽는 화면. 카드는 절차 요약 1장과 흐름 그림 1장씩이다.
  // 단계 설명과 용어집은 화면 아래 1/3 패널로 연다. 여는 버튼은 화면 맨 아래 얇은 바(dock)에 고정해
  // 스크롤 위치와 상관없이 바로 열 수 있고 본문을 가리지 않는다. 위쪽 2/3에는 그림이 그대로 보인다.
  // 단계 설명은 한 단계씩 [이전 단계]·[다음 단계]로 넘기며, 넘길 때마다 그림의 그 화살표를 강조하고
  // 패널에 가려지면 스크롤한다. 화살표를 탭하면 그 단계로 바로 간다. 용어집은 패널 안에서 스크롤한다.
  // include로 묶은 세트는 위쪽 탭으로 묶인 세트를 고르고, 마지막 카드에서 다음 세트로 넘어간다.
  var qById = {};
  DATA.forEach(function (q) { qById[q.id] = q; });
  var cState = { pages: [], p: 0, c: 0, sheet: null, hl: -1, open: {} };
  var elSheet = document.getElementById("sheet");
  var elSheetTabs = document.getElementById("sheet-tabs");
  var elSheetBody = document.getElementById("sheet-body");
  var elEdgeTabs = document.getElementById("edge-tabs");
  var elSheetFoot = document.getElementById("sheet-foot");

  function cardsOf(pg) {
    var cards = [{ kind: "summary" }];
    (pg.flows || []).forEach(function (fl, i) {
      cards.push({ kind: "flow", fl: fl, n: i + 1, of: pg.flows.length });
    });
    return cards;
  }

  // 흐름 그림의 화살표 목록. 강조를 화살표 단위로 하려고 stepIdx에 화살표 번호를 넣는다.
  function flowActorsRows(q) {
    var actors, rows;
    if (q.type === "steps") {
      actors = q.actors || collectActors(q.steps);
      rows = expandStepRows(q.steps, q.steps.length);
    } else {
      actors = collectActors(q.items);
      rows = q.items;
    }
    rows = rows.map(function (r, i) { return { msg: r.msg, from: r.from, to: r.to, stepIdx: i }; });
    return { actors: actors, rows: rows };
  }

  function curCard() {
    var pg = cState.pages[cState.p];
    return { pg: pg, card: cardsOf(pg)[cState.c], len: cardsOf(pg).length };
  }

  function cardNode(pg, card) {
    var box = el("div", { cls: "concept-card" });
    if (card.kind === "summary") {
      box.appendChild(el("div", { cls: "card-kicker", text: "절차 요약" }));
      box.appendChild(proseNode(pg.summary, "concept-summary", true));
      return box;
    }
    // 흐름 제목은 카드의 제목이라 크게, 순번(흐름 1/2)은 그 위에 작게 보여준다.
    box.appendChild(el("div", { cls: "card-kicker", text: "흐름 " + card.n + "/" + card.of }));
    box.appendChild(el("h3", { cls: "card-heading", text: card.fl.title }));
    // 이 절차가 일어나는 단말의 상태·상황 예시(concepts.yaml의 when)
    if (card.fl.when) {
      var whenBox = el("div", { cls: "when-box" });
      whenBox.appendChild(el("div", { cls: "when-head", text: "이럴 때 일어난다" }));
      var ul = el("ul");
      card.fl.when.forEach(function (w) { ul.appendChild(richNode("li", "", w)); });
      whenBox.appendChild(ul);
      box.appendChild(whenBox);
    }
    var fr = flowActorsRows(qById[card.fl.id]);
    box.appendChild(renderDiagram(fr.actors, fr.rows, function (idx) {
      cState.hl = idx;
      cState.sheet = "notes";
      drawConcept(false);
    }, cState.hl));
    box.appendChild(el("div", { cls: "concept-hint", text: "화살표를 탭하면 그 단계 설명이 열린다" }));
    return box;
  }

  function moveCard(step) {
    var len = cardsOf(cState.pages[cState.p]).length;
    if (step > 0) {
      if (cState.c < len - 1) cState.c++;
      else if (cState.p < cState.pages.length - 1) { cState.p++; cState.c = 0; }
    } else {
      if (cState.c > 0) cState.c--;
      else if (cState.p > 0) { cState.p--; cState.c = cardsOf(cState.pages[cState.p]).length - 1; }
    }
    cState.hl = -1;
    if (cState.sheet === "notes") {
      // 단계 설명을 연 채로 넘기면 새 흐름은 1단계부터, 흐름이 아닌 카드면 패널을 닫는다.
      if (curCard().card.kind === "flow") cState.hl = 0;
      else cState.sheet = null;
    }
    drawConcept(true);
  }

  function drawConcept(toTop) {
    var pages = cState.pages;
    var cur = curCard();
    elConceptBody.innerHTML = "";

    if (pages.length > 1) {
      var tabs = el("div", { cls: "picker-row concept-tabs" });
      pages.forEach(function (p, i) {
        var b = el("button", { cls: "pick-btn" + (i === cState.p ? " sel" : ""), text: p.name });
        b.addEventListener("click", function () {
          cState.p = i; cState.c = 0; cState.hl = -1;
          if (cState.sheet === "notes") cState.sheet = null;
          drawConcept(true);
        });
        tabs.appendChild(b);
      });
      elConceptBody.appendChild(tabs);
    }
    elConceptBody.appendChild(el("h2", { cls: "concept-title", text: cur.pg.name }));
    elConceptBody.appendChild(cardNode(cur.pg, cur.card));

    var first = cState.p === 0 && cState.c === 0;
    var last = cState.p === pages.length - 1 && cState.c === cur.len - 1;
    var nav = el("div", { cls: "concept-nav" });
    var prev = el("button", { cls: "secondary", text: "◀ 이전" });
    prev.disabled = first;
    prev.addEventListener("click", function () { moveCard(-1); });
    var pos = el("span", { cls: "concept-pos", text: (cState.c + 1) + " / " + cur.len });
    var next = el("button", { cls: "secondary", text: cState.c === cur.len - 1 && !last ? "다음 세트 ▶" : "다음 ▶" });
    next.disabled = last;
    next.addEventListener("click", function () { moveCard(1); });
    nav.appendChild(prev);
    nav.appendChild(pos);
    nav.appendChild(next);
    elConceptBody.appendChild(nav);

    // 화면 맨 아래 고정 바. 단계 설명은 흐름 카드에서만 연다.
    elEdgeTabs.innerHTML = "";
    if (cur.card.kind === "flow") elEdgeTabs.appendChild(sheetButton("notes", "단계 설명 ▲"));
    elEdgeTabs.appendChild(sheetButton("terms", "용어집 ▲"));

    drawSheet();
    if (toTop) window.scrollTo(0, 0);
    else revealHighlightedRow();
  }

  function sheetButton(kind, label) {
    var b = el("button", { cls: "dock-btn", text: label });
    b.addEventListener("click", function () {
      cState.sheet = cState.sheet === kind ? null : kind;
      if (cState.sheet === "notes" && cState.hl < 0) cState.hl = 0;
      drawConcept(false);
    });
    return b;
  }

  function drawSheet() {
    var cur = curCard();
    var open = !!cState.sheet && !elConcept.hidden;
    elSheet.hidden = !open;
    elEdgeTabs.hidden = open || elConcept.hidden;
    document.body.classList.toggle("panel-open", open);
    document.body.classList.toggle("dock-open", !open && !elConcept.hidden);
    elSheetFoot.innerHTML = "";
    if (!open) return;

    elSheetTabs.innerHTML = "";
    var kinds = cur.card.kind === "flow" ? [["notes", "단계 설명"], ["terms", "용어집"]] : [["terms", "용어집"]];
    kinds.forEach(function (k) {
      var b = el("button", { cls: "sheet-tab" + (cState.sheet === k[0] ? " on" : ""), text: k[1] });
      b.addEventListener("click", function () {
        cState.sheet = k[0];
        if (cState.sheet === "notes" && cState.hl < 0) cState.hl = 0;
        drawConcept(false);
      });
      elSheetTabs.appendChild(b);
    });

    elSheetBody.innerHTML = "";
    // 탭이나 카드가 바뀌면 시트 스크롤을 맨 위로 되돌린다(이전 탭의 스크롤 위치가 남지 않게).
    var where = cState.sheet + "@" + cState.p + ":" + cState.c;
    if (elSheetBody.getAttribute("data-where") !== where) {
      elSheetBody.scrollTop = 0;
      elSheetBody.setAttribute("data-where", where);
    }
    if (cState.sheet === "notes") {
      // 한 단계씩: 지금 단계 설명 하나와 이전·다음 단계 버튼.
      var fr = flowActorsRows(qById[cur.card.fl.id]);
      var notes = cur.card.fl.notes;
      var i = cState.hl;
      elSheetBody.appendChild(el("div", { cls: "step-head", text: (i + 1) + " / " + notes.length + " · " + fr.rows[i].msg }));
      elSheetBody.appendChild(proseNode(notes[i], "step-text", false));
      var stepNav = el("div", { cls: "step-nav" });
      var sp = el("button", { cls: "secondary", text: "◀ 이전 단계" });
      sp.disabled = i === 0;
      sp.addEventListener("click", function () { cState.hl = i - 1; drawConcept(false); });
      var sn = el("button", { cls: "secondary", text: "다음 단계 ▶" });
      sn.disabled = i === notes.length - 1;
      sn.addEventListener("click", function () { cState.hl = i + 1; drawConcept(false); });
      stepNav.appendChild(sp);
      stepNav.appendChild(sn);
      // 이전·다음 버튼은 패널 맨 아래에 고정한다(설명 길이와 상관없이 같은 자리를 연달아 탭할 수 있게).
      elSheetFoot.appendChild(stepNav);
    } else {
      var terms = el("div", { cls: "sheet-terms" });
      cur.pg.terms.forEach(function (t, i) {
        var key = cState.p + ":" + i;
        var item = el("div", { cls: "sheet-term" + (cState.open[key] ? " on" : "") });
        var head = el("button", { cls: "sheet-term-head", text: (cState.open[key] ? "▾ " : "▸ ") + t.term });
        if (t.full) head.appendChild(el("span", { cls: "term-full", text: t.full }));
        head.addEventListener("click", function () {
          cState.open[key] = !cState.open[key];
          var y = elSheetBody.scrollTop;
          drawSheet();
          elSheetBody.scrollTop = y;
        });
        item.appendChild(head);
        if (cState.open[key]) {
          item.appendChild(proseNode(t.desc, "sheet-term-desc", false));
          if (t.when) item.appendChild(richNode("div", "term-when", "예: " + t.when));
          item.appendChild(el("div", { cls: "term-ref", text: t.ref }));
        }
        terms.appendChild(item);
      });
      elSheetBody.appendChild(terms);
    }
  }

  // 강조한 화살표가 화면 밖이거나 아래 패널에 가려지면, 패널 위 영역의 위쪽 1/4쯤으로 스크롤한다.
  function revealHighlightedRow() {
    var row = elConceptBody.querySelector(".diagram-row.hl");
    if (!row) return;
    var r = row.getBoundingClientRect();
    var visibleBottom = cState.sheet ? window.innerHeight - elSheet.offsetHeight : window.innerHeight;
    if (r.top < 0 || r.bottom > visibleBottom) window.scrollBy(0, r.top - visibleBottom * 0.25);
  }

  function showConcept() {
    cState = { pages: CONCEPTS[sel.set] || [], p: 0, c: 0, sheet: null, hl: -1, open: {} };
    if (!cState.pages.length) return;
    elStart.hidden = true;
    elConcept.hidden = false;
    drawConcept(true);
  }

  function closeSheet() {
    cState.sheet = null;
    elSheet.hidden = true;
    elEdgeTabs.hidden = true;
    document.body.classList.remove("panel-open");
    document.body.classList.remove("dock-open");
  }
  document.getElementById("sheet-close").addEventListener("click", function () {
    cState.sheet = null;
    drawConcept(false);
  });

  function showStart() {
    closeSheet();
    elConcept.hidden = true;
    elQList.hidden = true;
    elQuiz.hidden = true;
    elHdr.hidden = true;
    elFeedback.hidden = true;
    elStart.hidden = false;
    refreshPicker();
  }

  // ---- 문제 목록 (중요도순) ----
  // 퀴즈가 아니라 훑어보기용. 지금 고른 조건의 문제를 중요도 높은 순으로 나열하고,
  // 문제를 탭하면 그 자리에서 정답·해설·근거를 펼친다(정답 그림은 펼칠 때 만든다).
  var elQList = document.getElementById("qlist");
  var elQListBody = document.getElementById("qlist-body");

  function listItem(q) {
    var item = el("div", { cls: "qitem" });
    var head = el("div", { cls: "qitem-meta" });
    head.appendChild(el("span", { cls: "qitem-stars", text: IMP_STARS[q.importance] }));
    head.appendChild(el("span", { text: " " + q.topic + " · " + (TYPE_LABEL[q.type] || q.type) + " · " + q.id }));
    item.appendChild(head);
    item.appendChild(el("div", { cls: "qitem-q" + (looksRaw(q.question) ? " raw" : ""), text: q.question }));
    var more = el("div", { cls: "qitem-more", text: "▸ 정답·해설 보기" });
    item.appendChild(more);
    var detail = null;
    item.addEventListener("click", function (ev) {
      if (detail && detail.contains(ev.target)) return; // 펼친 내용 안을 탭하면 접지 않는다
      if (detail) {
        detail.remove();
        detail = null;
        more.textContent = "▸ 정답·해설 보기";
        return;
      }
      detail = el("div", { cls: "qitem-detail" });
      detail.appendChild(answerNode(q));
      detail.appendChild(el("p", { cls: "explain", text: q.explain }));
      detail.appendChild(el("p", { cls: "ref", text: "ref: " + q.ref }));
      item.appendChild(detail);
      more.textContent = "▾ 접기";
    });
    return item;
  }

  function showList() {
    var qs = matching().slice().sort(function (a, b) {
      return b.importance - a.importance || (a.id < b.id ? -1 : 1);
    });
    elQListBody.innerHTML = "";
    elQListBody.appendChild(el("h2", { cls: "concept-title", text: "문제 목록 · " + filterLabel().replace(" ▾", "") }));
    elQListBody.appendChild(el("div", { cls: "order-label", text: qs.length + "문제 · 중요도순 · 문제를 탭하면 정답과 해설" }));
    [3, 2, 1].forEach(function (lv) {
      var group = qs.filter(function (q) { return q.importance === lv; });
      if (!group.length) return;
      elQListBody.appendChild(el("div", { cls: "qgroup-head", text: IMP_STARS[lv] + " " + IMP_NAME[lv] + " (" + group.length + ")" }));
      group.forEach(function (q) { elQListBody.appendChild(listItem(q)); });
    });
    elStart.hidden = true;
    elQList.hidden = false;
    window.scrollTo(0, 0);
  }

  function startQuiz() {
    POOL = matching();
    if (!POOL.length) return;
    deck = [];
    elStart.hidden = true;
    closeSheet();
    elConcept.hidden = true;
    elQList.hidden = true;
    elQuiz.hidden = false;
    elHdr.hidden = false;
    elDeckChange.textContent = filterLabel();
    render(nextQuestion());
  }

  elStartBtn.addEventListener("click", startQuiz);
  elConceptBtn.addEventListener("click", showConcept);
  document.getElementById("list-btn").addEventListener("click", showList);
  document.getElementById("qlist-back").addEventListener("click", showStart);
  document.getElementById("qlist-start").addEventListener("click", startQuiz);
  elConceptBack.addEventListener("click", showStart);
  elConceptStart.addEventListener("click", startQuiz);
  elDeckChange.addEventListener("click", showStart);

  // 주제가 하나뿐이면 '전체'와 중복이라 주제 선택 줄은 숨긴다.
  if (topicVals.length <= 1) elTopicGroup.hidden = true;
  // 주관식 문제가 없으면 주관식 줄을 숨긴다.
  if (!DATA.some(function (q) { return q.type === "open"; })) document.getElementById("open-group").hidden = true;
  // 세트가 정의되지 않았으면 세트 선택 줄을 숨긴다.
  if (!SETS.length) elSetGroup.hidden = true;
  // 유형 묶음이 하나뿐이면 '전체'와 중복이라 유형 선택 줄도 숨긴다.
  if (modeVals.length <= 1) elModeGroup.hidden = true;

  showStart();
})();
