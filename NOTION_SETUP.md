# Notion 연동 셋업 가이드

노션 데이터베이스에서 컨셉을 관리하고, 빌드 시 자동으로 사이트에 반영합니다.

## 데이터베이스 스키마 (8개 속성)

| 속성 이름 | 타입 | 비고 |
|----------|------|------|
| Title | Title | 제목 (한글 / 영문 자유) |
| Slug | Text | URL용 영문 슬러그 (예: `sorage-house`). 중복 X, 영문/숫자/하이픈만 |
| Tags | Multi-select | **그래프 연결의 기준**. 같은 태그 2개 이상 공유하는 컨셉끼리 선으로 연결됨 |
| Brief | Text | 초기 아이디어 메모 |
| Statement | Text | 다듬은 설명 |
| Cover | Files & media | **첫 이미지 1장** — 그래프 노드 썸네일이 됨 |
| Gallery | Files & media | 나머지 이미지들 — 디테일 페이지 갤러리 |
| Published | Checkbox | 체크된 row만 사이트에 노출 |

> 💡 Tone, Subtitle, Date는 정리에서 제외됐어요. Tone 카테고리는 Tags에 자유롭게 통합해서 쓰세요.

## 사용 흐름

1. **노션에서 row 추가/편집** — 위 8개 속성 입력, 이미지 드래그
2. **Published 체크** ✓ (안 하면 사이트에 안 나옴)
3. **"사이트 업데이트해줘"** 라고 알려주세요 — Claude가 MCP로 노션에서 받아와 이미지 압축 + 사이트 재빌드

## 새 컨셉 입력 체크리스트

- ✓ Title — 제목 (한글 또는 영문)
- ✓ Slug — 영문 (예: `my-concept`, `cool-chair`). **다른 row와 중복 X**
- ✓ Tags — 여러 개 선택 가능. 새 태그 그냥 타이핑하면 자동 추가됨
- ✓ Brief 또는 Statement (둘 다 안 적어도 OK)
- ✓ Cover에 이미지 1장 (그래프 노드 썸네일)
- ✓ Gallery에 나머지 이미지들 (큰 파일도 OK — 빌드 시 자동 압축)
- ✓ Published 체크

## 그래프 연결 만드는 팁

- 두 컨셉이 **같은 태그를 2개 이상** 가져야 그래프에 선으로 연결됨
- 예: 컨셉 A가 `가구` + `곡선`, 컨셉 B도 `가구` + `곡선`을 가지면 연결
- 자주 쓰는 태그 (가구, 의자, 건축, 곡선, 말랑말랑 등) 위주로 일관되게 붙이면 그래프가 풍성해짐

## 이미지 용량

빌드 시 자동 압축됩니다:

| 용도 | 크기 | 포맷 | 평균 |
|------|------|------|------|
| Cover (그래프 노드) | 900px max | WebP q78 | ~40 KB |
| Gallery (디테일) | 1600px max | WebP q82 | ~120 KB |

40 컨셉 × 평균 15장 ≈ **60 MB** — Vercel 무료 플랜 한도 안에 충분.

## (옵션) 조회수 정렬 — Upstash Redis 셋업

리스트 모드를 "사람들이 많이 본 컨셉 순"으로 정렬하려면 Upstash Redis 무료 계정 연결만 하면 됩니다. 코드는 이미 준비됨.

1. https://console.upstash.com/redis 가입 (GitHub/Google로 1분)
2. **Create Database** → 이름 자유, region은 가까운 곳 (e.g. ap-northeast-1) → Create
3. 데이터베이스 페이지에서 **REST API** 섹션 → **`UPSTASH_REDIS_REST_URL`** 와 **`UPSTASH_REDIS_REST_TOKEN`** 복사
4. `.env.local` 에 두 값 추가:
   ```
   UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
   UPSTASH_REDIS_REST_TOKEN=xxxxx...
   ```
5. Vercel에 배포한 경우엔 Vercel Project Settings → Environment Variables 에 같은 두 값 추가 후 redeploy

세 가지 자동 작동:
- 디테일 페이지 진입할 때마다 `/api/views` 가 카운터 +1
- `/list` 페이지는 매 1분마다 카운터 다시 읽어서 내림차순 정렬
- 카운터 없는 컨셉은 원래 순서 유지 (publish 직후엔 모두 0이라 원래 순서)

값이 없으면 (env vars 비어있으면) view 추적/정렬 비활성화 — 사이트는 정상 작동.

## (옵션) 직접 sync 실행하려면

MCP가 아닌 본인 PC에서 직접 sync하려면 `.env.local`에 노션 API 토큰 + DB ID 넣은 후:

```bash
npm run sync:notion   # 노션 → 이미지 압축 → concepts.json
npm run build         # Next.js 빌드
```

토큰 발급은 https://www.notion.so/my-integrations 에서.
