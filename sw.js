// 홈 화면 설치용 최소 서비스워커 (오프라인 캐시는 Firestore가 담당)
self.addEventListener('install',e=>self.skipWaiting());
self.addEventListener('activate',e=>self.clients.claim());
self.addEventListener('fetch',()=>{});
