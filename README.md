# QRCodeMenu

React + Vite 기반 테이블 QR 메뉴 및 주문 시스템입니다.

## 기술 구성
- React + Vite
- Supabase Database / RPC / Realtime
- 매장 카운터 결제
- Cloudflare Pages 배포 가능

## 로컬 실행
```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 Supabase 프로젝트 URL과 anon/publishable key를 입력합니다. `service_role` 키는 절대 프론트엔드에 넣지 마세요.

## Supabase 초기 설정
1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/202610300001_initial_schema.sql` 내용을 실행합니다.
3. Table Editor에서 `menu_items`에 메뉴를 등록합니다. 현재 예시 화면 메뉴와 DB 메뉴 ID/가격은 실제 운영 전에 일치시켜야 합니다.
4. 프로젝트 URL과 anon/publishable key를 `.env.local`에 설정합니다.

## 현재 구현 범위
- 모바일/데스크톱 고객 메뉴 화면
- 카테고리 필터, 장바구니, 수량 변경
- 카운터 결제 방식의 주문 요청 RPC 연결
- 로컬 데모 주문 접수 화면
- Supabase Realtime 구독 기본 연결 코드

## 운영 전 필수 작업
- 숫자 테이블 파라미터 대신 추측하기 어려운 QR 테이블 토큰 URL로 전환
- 직원 로그인, 역할 관리 및 주문/주문상세 RLS 정책 구현
- 직원 인증 후 기존 주문 조회 및 상태 변경 기능 구현
- `orders` 테이블 Realtime publication 설정
- 메뉴 관리/품절 처리/테이블 QR 생성 화면 구현
- 실제 메뉴 데이터와 주문 UI 연결 후 테스트

현재 카운터 화면은 초기 데모입니다. 직원 인증과 RLS 정책을 완성하기 전에는 공개 인터넷 환경에서 실제 매장 운영에 사용하지 마세요.
