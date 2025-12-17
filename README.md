# Data-Visualization

## 如何啟動安全預覽伺服器 (With Cloudflare Tunnel)

### 1. 安裝 Cloudflare Tunnel 工具
請根據您的作業系統下載 `cloudflared`，並將其放入專案的 `tools/` 資料夾中 (若無此資料夾請自行建立)。

- **Windows**: [下載連結 (64-bit)](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe)
    - 下載後請重新命名為 `cloudflared.exe` 並放入 `tools/` 資料夾。
- **macOS**:
    - 使用 Homebrew: `brew install cloudflared`
    - 或 [下載連結](https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64) (將下載檔案重新命名為 `cloudflared` 並給予執行權限 `chmod +x cloudflared`)
- **Linux**: [下載連結 (deb/rpm)](https://github.com/cloudflare/cloudflared/releases/latest/)

### 2. 啟動伺服器與隧道
若要與組員分享網頁，請依序執行以下步驟：

1.  **啟動 Python 網頁伺服器** (Port 7234)
    開啟終端機，執行以下指令：
    ```powershell
    python -m http.server 7234 --bind 127.0.0.1
    ```

2.  **啟動 Cloudflare Tunnel**
    開啟一個**新的**終端機視窗，執行以下指令：
    - **Windows**:
      ```powershell
      .\tools\cloudflared.exe tunnel --url http://127.0.0.1:7234
      ```
    - **macOS / Linux** (若已安裝至系統路徑):
      ```bash
      cloudflared tunnel --url http://127.0.0.1:7234
      ```

3.  **取得公開網址**
    - 啟動後，終端機視窗中會顯示一個以 `.trycloudflare.com` 結尾的網址。
    - 將該網址複製並傳送給組員即可。
    - **注意**：每次重新啟動 Tunnel，網址都會改變。

### [進階] 使用固定網址 (僅限專案擁有者)
若您已設定好 Cloudflare Tunnel 憑證，可使用以下指令啟動固定網址 `viz-demo.cyfox.click`：

```powershell
.\tools\cloudflared.exe tunnel --config tools\config.yml run
```
*(注意：此模式需要本機擁有對應的 Cloudflare 憑證 json 檔案才可執行)*