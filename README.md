# 승강기 현장수첩 (웹앱)

claude.ai 아티팩트로 만든 "승강기 현장수첩"을 Firebase(저장소·로그인) + GitHub Pages(주소)로 옮긴 버전입니다.

- 화면: `index.html` (아티팩트 화면 그대로)
- 저장소 연결: `fb.js` (아티팩트의 db·사진·내려받기 기능을 Firebase로 대신함)
- 설정값: `firebase-config.js` (비밀번호 아님, 공개돼도 괜찮음)
- 보안 규칙: `firestore.rules` (Firebase 콘솔 → Firestore → 규칙에 붙여넣기)
- 데이터 옮기기: 로그인 후 주소 끝에 `#import` 를 붙여 열고, 아티팩트에서 받은 전체 백업 JSON 파일 선택
