import { defineConfig } from "vite";
import { resolve } from "node:path";

const pageEntries = [
  "index.html",
  "login/index.html",
  "login/account.html",
  "mypage/index.html",
  "mypage/account/index.html",
  "mypage/account/passwordreset.html",
  "mypage/class-profile/index.html",
  "mypage/create/index.html",
  "mypage/edit/index.html",
  "mypage/edit/basic/index.html",
  "mypage/edit/documents/index.html",
  "mypage/score-profile/index.html",
  "system/index.html",
  "system/announcements/index.html",
  "system/core/index.html",
  "system/manage/index.html",
  "system/result/index.html",
];

export default defineConfig({
  build: {
    assetsInlineLimit(filePath) {
      if (filePath.endsWith("tournament-trophy.svg")) return false;
      return undefined;
    },
    rollupOptions: {
      input: Object.fromEntries(
        pageEntries.map((entry) => [
          entry.replace(/\/index\.html$/, "").replace(/\.html$/, "") || "home",
          resolve(import.meta.dirname, entry),
        ]),
      ),
    },
  },
});
