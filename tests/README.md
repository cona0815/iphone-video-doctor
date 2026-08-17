# 測試

用 Playwright 攔截網路請求，模擬各種網路情境，驗證診斷引擎的判讀是否正確。

```bash
npm i playwright
node tests/test.js     # 診斷正確性（六種情境）
node tests/shot2.js    # 深色／淺色截圖
```

`test.js` 需要一個測試影片 `test.webm`，可用 ffmpeg 產生：

```bash
ffmpeg -f lavfi -i "testsrc=size=640x360:rate=25:duration=30" \
       -c:v libvpx-vp9 -b:v 300k -deadline realtime -cpu-used 8 test.webm
```

（腳本內的路徑是絕對路徑，執行前請依實際位置調整。）
