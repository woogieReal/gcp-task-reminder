import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 화면 로직(public/time.js)은 로컬 시간대를 쓰므로 실행 환경과 무관하게 고정한다.
    env: { TZ: 'Asia/Seoul' },
  },
});
