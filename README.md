# QRCodeMenu

React + Vite 기반 테이블 QR 메뉴 및 주문 시스템입니다.

## 기술 구성
- React + Vite
- Supabase Database / Auth / RPC / Realtime
- 매장 카운터 결제
- Cloudflare Pages 배포

## 로컬 실행
```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`에 Supabase 프로젝트 URL과 anon/publishable key를 입력합니다. `service_role` 키는 프론트엔드에 절대 넣지 마세요.

## Supabase 설정 순서

1. Supabase SQL Editor에서 `supabase/migrations/202610300001_initial_schema.sql` 실행
2. 직원 계정을 Authentication → Users에서 생성
3. 직원 UUID를 이용해 직원 역할 지정:
   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"staff"}'::jsonb
   where id = '직원-사용자-UUID';
   ```
4. SQL Editor에서 아래 migration을 순서대로 실행:
   - `202610300002_staff_order_access.sql`
   - `202610300003_table_qr_tokens.sql`
   - `202610300004_customer_order_history_payment.sql`
   - `202610300005_staff_menu_management.sql`
   - `202610300006_menu_item_images.sql`
5. 직원 계정이 이미 로그인되어 있었다면 로그아웃 후 다시 로그인해 새 JWT를 발급받습니다.
6. Cloudflare Pages 환경변수에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`를 설정합니다.

## 사용 방법

### 카운터 직원
- `카운터 / 관리자`에서 직원 계정으로 로그인
- `테이블 QR 관리`에서 테이블을 추가하고 QR PNG 다운로드
- QR 코드를 각 테이블에 부착
- `주문 관리`에서 주문 내용 및 조리 상태 확인
- `메뉴 관리`에서 음식종류 및 각 종류별 메뉴 등록, 음식 사진 업로드
- 손님이 카운터에서 결제하면 해당 주문의 결제 상태를 `결제 완료`로 변경

### 손님
- 테이블 QR을 스마트폰으로 스캔해 메뉴 화면 접속
- 메뉴를 장바구니에 담고 `주문하기` 선택
- `주문 내역` 메뉴에서 이 기기에서 접수한 주문, 메뉴별 수량/금액, 주문 상태, 결제 전/완료 상태 확인
- 결제는 매장 카운터에서 진행

## 구현 기능
- 모바일/데스크톱 반응형 메뉴, 카테고리, 장바구니
- 테이블별 고유 QR 토큰 및 QR 이미지 다운로드
- QR 토큰 검증을 통한 테이블 식별과 주문 접수
- 손님용 주문 내역 조회 RPC
- 주문별 결제 전/완료 상태 관리
- 직원 로그인, 주문 상태 변경, Realtime 주문 갱신

## 참고
- 손님 주문 내역은 QR 토큰에 연결된 테이블의 주문 ID만 반환하도록 RPC에서 검증합니다.
- 주문 ID 목록은 주문한 휴대폰 브라우저의 로컬 저장소에 보관됩니다. 브라우저 데이터 삭제 또는 다른 기기 사용 시 이전 주문 목록을 복원할 수 없습니다.
- `app_metadata.role = 'staff'`로 등록된 직원만 카운터 주문 및 테이블 관리 기능을 이용할 수 있습니다.
- `service_role` 키는 어떤 경우에도 브라우저 코드나 Cloudflare의 `VITE_*` 환경변수에 넣지 마세요.
