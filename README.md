# Japan IPTV M3U

公開されている JapanIPTV の最新 JSON を取得し、HTTP/HTTPS の配信 URL を確認して、応答したストリームだけを M3U として返す Vercel 用プロジェクトです。

## M3U URL

```
https://<your-vercel-domain>/api/playlist.m3u
```

IPTVnator では上記 URL を「URLからプレイリストを追加」に登録してください。

## 仕様

- 元データ: `tareq236/JapanIPTV/jp_tv_channels.json`
- `url` と `url_free_tv` の両方を利用
- 全カテゴリーを収録
- URL形式が不正な項目、応答しない項目を除外
- 重複URLを除外
- Vercel CDNで15分キャッシュ
- 映像自体は中継せず、プレイヤーが配信元へ直接接続

> 配信元の都合、地域制限、認証、利用条件により、リスト生成後に再生できなくなる場合があります。各配信元の利用条件を確認してください。
