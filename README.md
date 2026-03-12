# Kukoro Telegram MVP

Steam의 `쿠코로` 감각을 텔레그램 환경으로 옮기기 위한 프로젝트입니다. 현재 MVP는 `GLRL (Green Light, Red Light)` 한 게임 루프를 텔레그램 Bot + Web UI 구조로 검증하는 데 초점을 두고 있습니다.

## 현재 구현 상태

지금까지 구현된 범위는 다음과 같습니다.

- 텔레그램 유저 생성
- 방 생성과 참가
- 게임 시작
- GREEN / RED 신호 전환
- 플레이어 이동
- RED 위반 누적
- 자동 탈락 또는 방장 수동 저격
- 완주 판정과 승자 판정
- 브라우저 운영 콘솔
- 실제 플레이 화면 `/play/[roomId]`

핵심 규칙은 `FIRST_FINISH` 기준입니다.

- GREEN일 때만 이동 가능
- RED에서 이동하면 위반 처리
- 방 설정에 따라 RED 즉시 탈락 가능
- 즉시 탈락이 꺼져 있으면 방장이 RED 적발자를 수동 저격 가능
- 첫 완주자가 승자

## 현재 화면 구성

### 1. 운영 콘솔 `/`

운영 콘솔은 디버그와 규칙 검증용 화면입니다.

- 유저 생성
- 방 생성
- 참가
- 게임 시작
- 신호 전환
- 이동
- 저격
- 현재 방 상태와 리더보드 확인

### 2. 플레이 화면 `/play/[roomId]`

플레이 화면은 쿠코로 스타일을 의식한 첫 번째 게임 뷰입니다.

- 가로 레이스 트랙
- 픽셀풍 아바타
- 실시간 방 상태 반영
- 선택 플레이어 강조
- RED / GREEN 시각 효과
- 탈락 / 승리 오버레이
- 플레이 화면에서 직접 게임 조작 가능

## API

기존 API는 유지하고 있습니다.

- `POST /api/users`
- `GET /api/rooms`
- `POST /api/rooms`
- `GET /api/rooms/[roomId]`
- `POST /api/rooms/[roomId]/join`
- `POST /api/rooms/[roomId]/start`
- `POST /api/rooms/[roomId]/signal`
- `POST /api/rooms/[roomId]/move`
- `GET /api/health`

추가된 API:

- `POST /api/rooms/[roomId]/shoot`

## 플레이 화면에서 가능한 조작

`/play/[roomId]`에서 바로 테스트할 수 있습니다.

- 게임 시작
- 신호 토글
- 강제 GREEN
- 강제 RED
- 플레이어 선택 후 이동
- RED 적발자 저격

키보드 입력:

- `Space` 또는 `Enter`: 선택 플레이어 이동
- `W` / `ArrowUp`: 이전 플레이어 선택
- `S` / `ArrowDown`: 다음 플레이어 선택
- `R`: RED
- `G`: GREEN

모바일/터치용으로도 버튼 기반 조작을 넣어두었습니다.

## 실시간 반영

플레이 화면은 Supabase Realtime 구독을 사용해 `rooms`, `room_players` 변경을 즉시 반영합니다.

- 기본은 Realtime
- 예비 수단으로 5초 fallback fetch 유지

## 로컬 실행

1. 의존성 설치

```bash
npm install
```

2. 환경 변수 준비

`.env.local`에 아래 값을 넣습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

3. 개발 서버 실행

```bash
npm run dev
```

4. 브라우저에서 확인

```text
http://localhost:3000
```

이미 다른 포트로 실행 중이면 해당 포트를 사용합니다. 현재 세션에서는 `http://localhost:9002`를 사용했습니다.

## 데이터베이스 마이그레이션

적용해야 하는 마이그레이션 파일:

- `supabase/migrations/20260312_red_light_green_light.sql`
- `supabase/migrations/20260312_red_light_green_light_flagged.sql`

이 마이그레이션은 다음 필드를 사용합니다.

- `room_players.position`
- `room_players.violations`
- `room_players.eliminated`
- `room_players.finished`
- `room_players.flagged_on_red`
- `rooms.ended_at`

그리고 `(room_id, user_id)` 유니크 인덱스를 추가합니다.

### 중요

마이그레이션이 적용되지 않으면 방 생성이나 플레이 연동이 실패합니다.

예:

```text
Could not find the 'eliminated' column of 'room_players' in the schema cache
```

### 중복 데이터가 있는 경우

기존 데이터에 중복 `(room_id, user_id)` 행이 있으면 유니크 인덱스 생성이 실패할 수 있습니다.

그 경우 먼저 중복을 정리한 뒤 인덱스를 생성해야 합니다.

```sql
delete from public.room_players rp
using (
  select id
  from (
    select
      id,
      row_number() over (
        partition by room_id, user_id
        order by joined_at asc, id asc
      ) as row_num
    from public.room_players
  ) ranked
  where ranked.row_num > 1
) duplicates
where rp.id = duplicates.id;
```

## 추천 테스트 순서

1. 유저 2명 이상 생성
2. 한 명을 방장으로 지정해 방 생성
3. 다른 유저를 참가시킴
4. 게임 시작
5. `/play/[roomId]` 접속
6. GREEN에서 이동
7. RED에서 위반 발생
8. 필요하면 방장이 저격
9. 한 명이 완주하면 승자와 종료 상태 확인

## 검증 완료 항목

현재 코드 기준으로 아래는 통과했습니다.

- `npm run build`
- `./node_modules/.bin/tsc --noEmit`

## 아직 안 한 것

- 실제 Telegram Bot UI 연결
- Telegram Web App 기준의 플레이어 인증/세션 연결
- 자동 테스트
- 프로덕션용 권한 및 보안 설계
- 다음 게임 모드
