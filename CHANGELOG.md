# 작업 기록 (CHANGELOG.md)

이 프로젝트에서 한 작업과 그 이유를 기록한다. 오래된 항목이 위에 있다.
Claude Code는 이 파일을 자동으로 읽지 않는다. 과거 결정의 경위가 필요할 때만 읽는다.
현재 지켜야 할 규칙은 이 파일이 아니라 `guide.md`와 `authoring-guide.md`에 있다.
아래 항목의 서술은 작성 당시 기준이다. 이후 변경으로 지금과 다를 수 있다.

## 2026-07-26 ~ 2026-08-19 (guide.md "진행 상황" 절에서 옮김)

- [x] `validator.py` — 타입별 필수 필드, id 형식/중복, topic/tags 허용 목록, ref 필수,
  `order` 타입 `{msg,from,to}` 구조 검사.
- [x] `build.py` — 검증 통과 후 `quiz.html` 단일 파일 생성. 셔플(세션 단위 비복원 추출,
  mcq 보기 순서, order 항목)과 PASS 버튼, 시퀀스 다이어그램(정답 입력 중에도, reveal
  에서도 동일 렌더러 재사용)까지 전부 HTML 내 JS가 런타임에 처리. 폰에서 실사용
  피드백 받아 order 타입 UI를 여러 차례 수정함(칩→탭 기반 다이어그램).
  실행: `python3 build.py` (레포 루트의 모든 `*.yaml`을 읽어 `quiz.html` 생성).
- [x] `sip.yaml` 26문제 — 메서드/메시지흐름(sip-0001~0006) + 응답 코드 클래스구조·
  혼동쌍(sip-0007~0026, RFC 3261 §21 전체 대조 검증됨). mcq 11 / ox 10(O:X 5:5 균형) /
  short 3 / order 2.
- [x] `difficulty` 필드 도입(2단계 basic/advanced, 필수). validator 강제, 기존 26문제
  태깅 완료(basic 12 / advanced 14). build.py에 **덱 선택 시작 화면** 추가 —
  topic·난이도를 골라 그 부분집합만 셔플. 선택지는 데이터에 존재하는 값에서 동적 생성
  (주제가 하나뿐이면 주제 줄 숨김). 헤더의 '덱 변경' 링크로 재선택.
- [x] `basic` 기본 문제 16개 추가(sip-0027~0042) — 예외 코드가 아니라 **기본 호 동작·
  고빈도 코드** 위주. order 2개(등록 인증 REGISTER→401→REGISTER→200 [RFC 3665 §2.1],
  기본 호 전체 설정+종료 [RFC 3261 §4 Figure 1]), mcq 6 / ox 6(O:X 3:3) / short 2.
  다룬 것: REGISTER/위치등록, ACK 3-way, BYE vs CANCEL, 100/180/183/200, 401/403/404
  기본 의미·혼동. 전량 RFC 3261/3665 원문 대조. 현재 총 42문제(basic 28 / advanced 14),
  ox 전체 O:X 8:8.

- [x] `build.py` 시작 화면에 **유형 필터**(전체/순서맞추기/순서 제외) 추가. '기본·순서맞추기'
  조합으로 기본 호 흐름만 집중 반복 가능.
- [x] 기본 순서맞추기(order) 4개 추가(sip-0043~0046) — 흔한 사용자 동작 위주, 전량 표준
  명시 흐름만: 등록 해제(REGISTER Expires:0→200, RFC 3665 §2.4), 세션 종료(BYE→200),
  통화중(INVITE→486→ACK), 부재중(INVITE→480→ACK, RFC 3261 §17.1.1.3 비-2xx도 ACK로
  확인). 현재 '기본·순서맞추기' 덱 7문제(sip-0002/0027/0030/0043/0044/0045/0046). 총 46문제.
- [x] **Diameter IMS 코어(Cx/Sh/Rx) 착수** — `diameter.yaml` 신설(prefix `diam-`), 24문제
  (basic 15 / advanced 9, order 5 / mcq 10 / ox 6[O:X 3:3] / short 3). SIP 서버 개발자
  관점, 인터페이스 단위 2~3 actor 흐름. 다룬 것: Cx 등록 UAR/UAA→MAR/MAA→SAR/SAA(3-actor),
  착신 LIR/LIA, 커맨드 역할·코드(300~303), Experimental-Result(2001~2004/5001~5005 대역),
  Sh UDR·SNR/PNR, Rx AAR·STR/ASR. 전량 3GPP TS 29.228/229/230·29.328/329·29.214,
  RFC 6733 대조 검증. 커맨드코드·Result코드는 TS 29.230 레지스트리로 확정.
- [x] **`steps` 타입 + `decoys` 도입** (사용자 피드백: order가 "나열만 하면 끝"이라 너무 쉽고,
  단일 인터페이스 조각만 있어 전체 서사가 안 보임). (1) `decoys`: order/steps 풀에 오답
  조각(Diameter는 R/A 쌍)을 섞어 채점 시 하나라도 담으면 오답. 기존 order 7개에 소급 적용
  (diam-0001/0002/0017/0018/0021, sip-0002/0030). (2) `steps`: 방향 없는 절차-순서 목록형
  타입 — 5+ actor라 다이어그램이 무너지는 end-to-end 서사용. `IMS` 토픽 신설(prefix `ims-`).
- [x] **IMS end-to-end 서사 3개**(`ims.yaml`, steps 타입): 등록(ims-0001)·착신(ims-0002)·
  발신(ims-0003) 전체 흐름. SIP REGISTER/INVITE 전달에 Cx(UAR/MAR/SAR, LIR)·Rx(AAR)가
  어디서 맞물리는지를 한 서사로 꿰고, 다른 시나리오 커맨드 쌍을 decoy로. TS 24.229/29.228
  대조. 총 73문제(SIP 46 / Diameter 24 / IMS 3). '순서맞추기' 필터는 order+steps 모두 포함.
- [x] **steps를 두-칸 워크스루로 리뉴얼** (피드백: 통째 정렬은 학습 약하고 UI 비직관적):
  매 단계 대상·동작을 각각 후보에서 고르게(둘 다 커밋 후 확인 — 교차 힌트 방지). 대상 축이
  "LIR는 I-CSCF↔HSS, MAR는 S-CSCF↔HSS" 노드 혼동을, 동작 축이 커맨드 혼동을 따로 짚는다.
- [x] **steps를 다이어그램-성장 방식으로 개선**(피드백: N-actor 시각화가 기억에 더 남음).
  steps를 `{from,to,act}` 화살표 + `actors` 레인으로 바꿔, 맞힐 때마다 시퀀스 다이어그램에
  화살표가 그려지며 쌓이게(`renderDiagram` 재사용). ims 3개를 **5-actor**로 재구성(등록:
  UE·P-CSCF·I-CSCF·S-CSCF·HSS / 착신: 발신자·I-CSCF·HSS·S-CSCF·UE / 발신: UE·P-CSCF·PCRF·
  S-CSCF·상대망). 폰 여백 축소(#app 12·card 14·diagram 11px·actor패딩 축소) + 넘치면
  `.diagram-scroll` 가로 스크롤 폴백. 다중 actor(3+) 폰 검증 대상이 diam-0001 → ims 5-actor로 확장.
- [x] **steps 워크스루 UX 개선**(피드백 4건): (1) R/A 쌍은 `rt:true`로 요청→·응답← 두 화살표
  펼침. (2) 틀린 슬롯만 빨강 표시. (3) 끝에 "정답 X/Y". (4) 화살표 초록 강조(highlightStep·
  `.diagram-row.hl`).
- [x] **SIP/IMS 기본 개념 1차 보완 28문제**(공백 메움). SIP 헤더·개념 14(sip-0047~0060,
  header 태그 첫 사용): Via/branch(z9hG4bK)·다이얼로그(Call-ID+태그)·트랜잭션·CSeq·Contact·
  Max-Forwards(70)·Record-Route·Registrar/Redirect·OPTIONS·Request-URI vs To. IMS 개념 14
  (ims-0004~0017): 엔티티 역할(P/I/S-CSCF·HSS·AS)·식별자(IMPI/IMPU)·레퍼런스 포인트(Gm/Mw/
  Cx/ISC/Sh/Rx). RFC 3261(§8·§12·§16·§20)·3GPP TS 23.228 대조(23.228 세부 조항번호는 미검증
  이라 스펙명+영역으로 표기). 총 101문제(SIP 60 / Diameter 24 / IMS 17), SIP ox 10:10.
- [x] **커맨드 뜻 피드백 추가**(피드백: 동작이 무슨 약자·동작인지 피드백 없어 '찍기'가 됨).
  확인하면 커맨드 풀네임·인터페이스·동작을 보여주고 `다음 ▸`으로 진행(맞든 틀리든 학습, 틀리면
  왜 아닌지도). 데이터는 `glossary`(act→뜻, decoy 포함) 한 벌. 상호작용을 "즉시 자동진행"에서
  "확인→뜻→다음"으로 전환(사용자 선택 A). 폰 여백 추가 축소(#app 10·card 12·gap 8·chip패딩·
  diagram 여백). 3GPP 기준 IMS 커맨드 용어사전(UAR/MAR/SAR/LIR/AAR 등) 작성.

## 2026-10-27

- [x] **문서 구조 정리.** 루트에 `CLAUDE.md` 진입점을 추가했다. 이전에는 `guide.md`가 자신을
  `CLAUDE.md`라고 설명했지만 실제 파일 이름이 달라 Claude Code가 자동으로 읽지 않았다.
  `CLAUDE.md`가 `guide.md`와 `authoring-guide.md`를 `@` import로 불러온다.
- [x] `guide.md`의 "진행 상황" 절(작업 기록 약 70줄)을 이 파일로 옮겼다. 매 세션 자동으로 읽는
  문서의 분량을 줄이기 위해서다. `guide.md`에는 실행 방법만 남겼다.
- [x] **스키마 변경 3건** (사용자 승인).
  - 유형 필터를 "전체/순서맞추기/순서제외"에서 "전체/짧은 문제/순서 나열/단계 완성"으로
    바꿨다. 이전에는 order와 steps가 한 묶음이었는데, 둘은 푸는 시간과 방식이 크게 다르다.
  - order에 `direction: false` 선택 필드를 추가했다. 13문제 중 12문제가 2자 흐름이라 방향이
    대부분 자명한데, 방향 초기값이 무작위라 사용자가 줄의 절반가량을 탭으로 고쳐야 했다.
    기본값은 기존과 같은 방향 채점이며, 기존 문제에는 아직 적용하지 않았다.
  - `match`(짝맞추기) 유형을 추가했다. 혼동쌍 여러 개를 한 화면에서 대조하게 한다. 예시
    문제 sip-0061(404/480/486/487 ↔ 의미) 1개를 넣었다. 네 사실은 모두 기존 문제의 ref로
    RFC 3261 §21.4.x 대조가 끝난 것이다.
