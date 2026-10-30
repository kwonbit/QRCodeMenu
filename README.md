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

`.env.local`에 Supabase 프로젝트 URL과 anon/publishable key를 입력합니다. `service_role` 키는 절대 프론트엔드에 넣지 마세요.

## Supabase 초기 설정
1. Supabase 프로젝트를 생성합니다.
2. SQL Editor에서 `supabase/migrations/202610300001_initial_schema.sql` 내용을 실행합니다.
3. Table Editor에서 `menu_items`에 메뉴를 등록하고 실제 메뉴와 가격을 맞춥니다.
4. 프로젝트 URL과 anon/publishable key를 Cloudflare Pages 환경변수에 설정합니다.

## 카운터 직원 계정 및 주문 조회 설정
1. Supabase 대시보드의 Authentication → Users에서 직원 이메일/비밀번호 계정을 생성합니다.
2. 해당 직원의 UUID를 확인한 뒤 SQL Editor에서 아래 명령을 실행합니다. UUID는 실제 직원 사용자 ID로 바꿉니다.
   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"staff"}'::jsonb
   where id = '직원-사용자-UUID';
   ```
3. `supabase/migrations/202610300002_staff_order_access.sql` 내용을 SQL Editor에서 실행합니다.
4. `supabase/migrations/202610300003_table_qr_tokens.sql` 내용을 SQL Editor에서 실행합니다.\n5. `supabase/migrations/202610300004_customer_order_history_payment.sql` 내용을 SQL Editor에서 실행합니다.\n6. 카운터 보기 탭에서 직원 이메일과 비밀번호로 로그인합니다. 로그인 후 최근 주문 100건과 주문 상세가 로드되고, 새 주문/상태 변경은 Realtime으로 갱신됩니다.
5. 직원 계정이 이미 로그인되어 있으면 권한 변경 후 로그아웃/로그인하여 새 JWT를 발급받습니다.

직원 역할은 사용자 편집 가능한 `user_metadata`가 아니라 관리자만 설정할 수 있는 `app_metadata.role`로 판별합니다. `service_role` 키를 프론트엔드에 절대 넣지 마세요.

## 현재 기능
- 모바일/데스크톱 고객 메뉴, 카테고리, 장바구니
- DB 가격으로 검증하는 고객 주문 RPC
- 카운터 직원 이메일/비밀번호 로그인
- 새로고침 후 기존 주문/주문 상세 조회
- 실시간 주문 변경 수신 및 주문 상태 변경

## 운영 전 추가 권장사항
- 숫자 테이블 파라미터 대신 추측하기 어려운 QR 테이블 토큰 URL로 전환
- 직원 계정 MFA 및 비밀번호 정책 적용
- 주문 취소/환불 정책과 결제 완료 상태를 실제 결제 흐름에 맞게 정의
- 메뉴 관리/품절 처리/테이블 QR 생성 화면 구현
- 운영 데이터 백업 및 모니터링 설정

고객에게는 주문 생성 RPC만 허용하고, 주문 및 주문 상세 조회/상태 변경은 `app_metadata.role = 'staff'`가 부여된 직원 계정에만 허용합니다.
