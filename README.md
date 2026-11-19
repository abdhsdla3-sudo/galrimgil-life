# 보드게임 마당 (갈림길 인생 · 항구의 길)

하나의 사이트 주소에서 보드게임을 골라 친구들과 각자의 화면으로 함께하는 한국어 온라인 보드게임. 수익화 없음.

| 게임 | 인원 | 한 줄 소개 | 규칙 |
|---|---|---|---|
| 갈림길 인생 | 2~12명 | 주사위와 선택으로 성장기부터 은퇴까지 서로 다른 인생 | [docs/RULES.md](docs/RULES.md) |
| 항구의 길 | 2~8명 | 한국 지역 또는 세계 도시 테마에서 땅을 사고 화물을 배달하는 경제 게임 | [docs/RULES-HARBOR.md](docs/RULES-HARBOR.md) |

- 참고 자료 조사 기록: [docs/RESEARCH.md](docs/RESEARCH.md)
- 진행 상황·남은 작업: [docs/PROGRESS.md](docs/PROGRESS.md)

## 실행 (Windows CMD)

Node.js 20 이상만 있으면 됩니다. 실행에는 외부 패키지가 필요 없습니다(Sites 빌드에만 esbuild 사용).

```bat
cd /d D:\game_create
npm start
```

브라우저에서 `http://localhost:3000` 을 엽니다.

| 명령 | 설명 |
|---|---|
| `npm start` | 서버 실행 (기본 포트 3000) |
| `npm run dev` | 파일이 바뀌면 자동 재시작 |
| `npm test` | 자동 테스트 (두 게임 규칙, 입장번호, 구버전 방 호환, 동시 입장, Sites Worker + D1 흉내) |
| `npm run lint` | 구문·UTF-8 인코딩·두 게임 콘텐츠 데이터 무결성 검사 |
| `npm run check` | lint + test |
| `npm ci` 후 `npm run build:sites` | ChatGPT Sites 배포 파일 생성 (`dist/`) |
| `node scripts\bots.js http://localhost:3000 <방ID> <비밀번호> 3` | 「갈림길 인생」 테스트용 봇 3명 참가 |

### 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `PORT` | 3000 | 서버 포트 |
| `HOST` | 0.0.0.0 | 바인딩 주소 |
| `DATA_DIR` | `./data` | 방·게임 저장 폴더 (`rooms/*.json`, 닫힌 방 번호 `codes.json`) |
| `TRUST_PROXY` | (없음) | 프록시 뒤에서 실행할 때 `1` (요청 제한에 실제 IP 사용) |

CMD 예: `set PORT=8080 && set DATA_DIR=D:\glg-data && npm start`

## 홈 화면과 6자리 입장번호

홈 `/` 는 두 종류의 방문자를 위해 위에서부터 이렇게 배치됩니다.

1. **입장번호로 참여** — 친구에게 받은 숫자 6자리를 입력(붙여넣기 시 숫자만 추출, Enter 제출, 모바일 숫자 키패드, 앞자리 0 유지). 게임을 고를 필요 없이 해당 방으로 이동합니다. 잘못된 번호·만료·정원 초과·입장 잠금·이미 시작된 게임을 구분해 안내하고 입력값은 그대로 둡니다.
2. **이어서 플레이** — 이 브라우저에 자리가 남아 있는 진행 중인 방이 있으면 표시.
3. **게임 카드 2장** — 대표 그림, 한 줄 설명, 「방 만들기」. 고른 게임의 설정만 보여 줍니다.
4. **다른 기기에서 이어하기** — 복구 코드 입력(접혀 있음).

- 방 번호는 서버가 사이트 전체에서 고유하게 발급합니다(두 게임 사이에도 겹치지 않음). 문자열로 다루므로 `012345` 도 유효합니다.
- 대기실에 번호를 크게 보여 주고 바로 옆 「번호 복사」로 숫자 6자리만 복사합니다. 초대 링크(`/r/<방ID>`)도 계속 쓸 수 있습니다.
- 새 방은 **번호와 닉네임만으로 참가**가 기본입니다. 방장이 「추가 비밀번호 걸기」를 켠 경우에만 비밀번호를 묻습니다.
- 닫힌 방(모두 나감·만료)의 번호는 7일 동안 "만료된 번호"로 안내하고 재발급하지 않습니다.
- 방 번호는 방을 찾는 용도일 뿐이며, 모든 행동은 각자의 참가 토큰(브라우저 저장 또는 복구 코드)으로 확인합니다.
- 두 게임 모두 대기실에서 채팅할 수 있습니다. 상대 메시지가 도착하면 화면 상단에 알림이 표시됩니다.

## 업데이트 전 데이터 호환

- 게임 종류 필드가 없는 기존 저장 데이터는 「갈림길 인생」으로 읽습니다. 저장 형식 버전(`schema: 1`)은 그대로입니다.
- 기존 `/r/<방ID>` 링크, 참가자 토큰·복구 코드, 방 비밀번호, 입장 잠금이 그대로 동작합니다. 기존 방에는 번호가 없으므로 대기실에서 링크 초대를 안내합니다.
- 실제 v0.2.0 코드로 만든 저장 데이터(`test/fixtures/legacy-v0.2.0.json`)로 로컬 서버와 Sites(D1 마이그레이션 전후) 양쪽에서 이어하기를 자동 테스트합니다.

## 저장과 이어하기

- 모든 행동은 서버에 즉시 저장됩니다(로컬: `DATA_DIR/rooms/<방ID>.json` 원자적 쓰기, Sites: D1).
- 창을 닫거나 새로고침해도 같은 브라우저로 같은 링크를 열면 진행 중인 선택으로 돌아옵니다.
- 서버가 주사위·잔액·소유권·차례·인원 제한을 검증합니다. 요청마다 `actionId`(더블클릭·재시도 중복 방지)와 `pendingId`(오래된 화면의 요청 거부)를 검사합니다.
- 「항구의 길」 새 방에서는 40칸 항로와 주사위 두 개를 사용합니다. 이미 시작된 24칸 게임은 기존 규칙으로 이어집니다. 선택 제한 시간(기본 60초)이 지나면 화면에 안내된 기본 행동이 적용됩니다.
- 방 보관 기간(마지막 활동 기준): 대기실 24시간, 진행 중 30일, 종료 후 3일.

## 「항구의 길」 이미지 (Codex 생성용)

이미지가 없어도 레이아웃과 플레이는 그대로 동작합니다(벡터 대체 그림·선박 실루엣 사용). 아래 경로에 파일을 넣으면 자동으로 적용됩니다.
화면은 `/assets/manifest.json`(서버가 `public/assets` 를 읽어 생성)에 있는 파일만 불러오므로, 없는 이미지를 요청하지 않습니다.
항구 이름·가격·버튼·방 번호는 모두 웹 텍스트로 그리므로 **이미지에 글자를 넣지 않습니다**.

| 용도 | 실제 경로 (파일명) | 비율 / 권장 크기 | 배경 | 화면에서 쓰는 곳 |
|---|---|---|---|---|
| 게임 선택 카드 — 갈림길 인생 | `public/assets/cards/life.png` | 16:9 / 1600×900 | 불투명 | 홈 게임 카드 |
| 게임 선택 카드 — 항구의 길 | `public/assets/cards/harbor.png` | 16:9 / 1600×900 | 불투명 | 홈 게임 카드 |
| 대표 항구 일러스트 | `public/assets/harbor/hero-port.png` | 1:1 / 1200×1200 | 불투명 | 항로 가운데 배경(반투명) |
| 선박 말 1 — 돛단배 (코럴) | `public/assets/harbor/ship-1.png` | 1:1 / 512×512 | **투명** | 1번 선장 말 |
| 선박 말 2 — 증기선 (청록) | `public/assets/harbor/ship-2.png` | 1:1 / 512×512 | **투명** | 2번 선장 말 |
| 선박 말 3 — 정크선 (노랑) | `public/assets/harbor/ship-3.png` | 1:1 / 512×512 | **투명** | 3번 선장 말 |
| 선박 말 4 — 예인선 (라벤더) | `public/assets/harbor/ship-4.png` | 1:1 / 512×512 | **투명** | 4번 선장 말 |

공통 스타일: 여행 포스터풍 평면 일러스트, 남색 바다(#0f1f3d), 청록 항로(#2ec4b6), 코럴 포인트(#ff6f59), 모래색(#f6efe2), 굵고 단순한 형태, 부드러운 그레인, 글자·로고·워터마크 없음.

### Codex 생성 프롬프트

1. **cards/life.png** — `16:9 flat travel-poster illustration for a Korean board game about life choices: a warm cream sky with a golden sun, rolling green hills, and a single orange path that splits into two roads at a crossroads with a tiny figure standing at the fork. Bold simple shapes, soft paper grain, warm orange (#e07a2f) and cream palette, no text, no letters, no logos.`
2. **cards/harbor.png** — `16:9 vintage travel-poster illustration of a fictional island harbor at dusk: deep navy sea (#0f1f3d), a dashed teal sea route (#2ec4b6) curving around small islands, a lighthouse, wooden piers, and a small sailboat with a coral sail (#ff6f59), big coral sun, sand-colored (#f6efe2) buildings. Flat bold shapes, subtle grain, centered composition with calm space at the edges, no text, no letters, no logos.`
3. **harbor/hero-port.png** — `square 1:1 travel-poster illustration of a busy fictional island port seen from above at an angle: navy water, teal shipping lane circling the island, cargo crates, cranes, warehouses with coral roofs, a lighthouse, gulls. Flat poster style, limited palette navy #0f1f3d, teal #2ec4b6, coral #ff6f59, sand #f6efe2, low contrast in the center so overlaid text stays readable, no text, no letters, no logos.`
4. **harbor/ship-1.png** — `game token, side view of a small sailboat with one large triangular coral (#ff6f59) sail and a sand-colored hull, thick dark navy outline, flat poster style, centered, fills 85% of the canvas, transparent background, no shadow on the ground, no text.`
5. **harbor/ship-2.png** — `game token, side view of a compact steamship with two tall teal (#38d6c4) funnels and a sand hull, thick dark navy outline, flat poster style, centered, fills 85% of the canvas, transparent background, no text.`
6. **harbor/ship-3.png** — `game token, side view of a junk ship with three ribbed yellow (#ffd166) battened sails and a curved wooden hull, thick dark navy outline, flat poster style, centered, fills 85% of the canvas, transparent background, no text.`
7. **harbor/ship-4.png** — `game token, side view of a sturdy tugboat with a tall lavender (#c3a6ff) wheelhouse, round rubber bumpers and a sand hull, thick dark navy outline, flat poster style, centered, fills 85% of the canvas, transparent background, no text.`

선박 네 장은 실루엣(돛 1장 / 굴뚝 2개 / 살대 돛 3장 / 높은 조타실)이 서로 달라야 하며, 화면은 이미지 둘레에 플레이어 색 테두리를 함께 그립니다.
파일을 넣은 뒤: 로컬은 새로고침만, Sites 는 `npm run build:sites` 후 다시 배포합니다(빌드가 PNG를 함께 묶고 목록을 만듭니다).

## 배포

### ChatGPT Sites (현재 운영)

`.openai/hosting.json` 의 기존 Sites 프로젝트 ID와 D1 바인딩(`DB`)을 그대로 사용합니다.

```bat
cd /d D:\game_create
npm ci
npm run check
npm run build:sites
```

- `dist/server/index.js`(Worker)와 `dist/.openai/hosting.json` 이 생성됩니다. Sites의 서버는 D1에 방을 저장하고, 게임 화면은 약 1.2초 간격으로 방 상태를 확인합니다.
- **D1 마이그레이션**: `drizzle/0001_room_codes.sql` 이 새로 추가되었습니다(입장번호 표 `room_codes`). 기존 `rooms`·`room_limits` 표는 바꾸지 않으므로 기존 방 데이터는 그대로 보존됩니다. 배포할 때 `drizzle/` 의 마이그레이션이 0000 → 0001 순서로 적용되어야 합니다.
- 로컬 서버와 Sites의 저장 공간은 별도입니다.
- Sites를 초대 방식으로 공유하는 경우 친구가 초대받은 ChatGPT 계정으로 로그인해야 합니다. 게임 안에서는 방 번호(또는 초대 링크)와, 설정한 경우에만 추가 비밀번호를 사용합니다.

### 그 밖의 호스팅
단일 Node 서버가 정적 파일·API·실시간 동기화(SSE)를 모두 처리하므로 영구 디스크가 있는 컨테이너 1개면 됩니다.
- **Fly.io**: `fly.toml`, `Dockerfile` 포함 → `fly launch --no-deploy --copy-config`, `fly volumes create glg_data --size 1`, `fly deploy`
- **Render**: `render.yaml` 블루프린트(유료 Starter + 디스크)
- **내 PC + Cloudflare 빠른 터널**: `npm start` 후 `cloudflared tunnel --url http://localhost:3000`

## 구조

```
game/            「갈림길 인생」 규칙 엔진·콘텐츠·설정 (서버와 브라우저 공용)
game/harbor/     「항구의 길」 데이터(가격표·이벤트)와 규칙 엔진
server/games.js  게임 목록 어댑터 (방 관리 코드는 이것만 통해 각 게임 규칙 호출)
server/rooms.js  방 관리·입장번호·참가 인증·저장 (로컬·Sites 공용)
server/index.js  로컬 HTTP 서버 (SSE 동기화)
server/sites-worker.js  ChatGPT Sites Worker (D1, 폴링 동기화)
drizzle/         D1 마이그레이션
public/          브라우저 화면 (바닐라 JS, 빌드 없음): app.js 홈·대기실, game-ui.js 갈림길 인생, harbor-ui.js 항구의 길
public/assets/   Codex 이미지 (없어도 동작)
test/            node:test 자동 테스트, 봇, 구버전 저장 데이터 픽스처
scripts/         lint, Sites 빌드, 테스트 봇
docs/            규칙, 조사 기록, 진행 상황
```
