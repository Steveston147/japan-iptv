# Japan IPTV M3U

公開されている JapanIPTV の最新 JSON を取得し、HTTP/HTTPS の配信 URL を確認して、応答したストリームだけを M3U として返す Vercel 用プロジェクトです。

## M3U URL

### Full版

地上波代替を含む幅広い版です。成人向け、ギャンブル、通販、URL形式不正の項目を除外します。

```
https://<your-vercel-domain>/api/full.m3u
```

### Stable版

実績のある公開配信基盤と、有効なHLS応答に限定した安定重視版です。

```
https://<your-vercel-domain>/api/stable.m3u
```

従来の `/api/playlist.m3u` はStable版として維持しています。

## 仕様

- 元データ: `tareq236/JapanIPTV/jp_tv_channels.json`
- `url` と `url_free_tv` の両方を利用
- 地上波（terrestrial）・BS・CSの一般放送を収録
- ニュース・天気・経済情報は収録
- 成人向け、グラビア、ギャンブル、通販、内容不明の項目を除外
- URL形式が不正な項目、応答しない項目を除外
- 実績のある公開配信基盤だけを採用
- 取得内容が有効なHLSプレイリスト（#EXTM3U）であることを確認
- 不安定な地上波代替中継、個人プロキシ、待機映像系を除外
- 重複URLを除外
- Vercel CDNで15分キャッシュ
- 映像自体は中継せず、プレイヤーが配信元へ直接接続

> 配信元の都合、地域制限、認証、利用条件により、リスト生成後に再生できなくなる場合があります。各配信元の利用条件を確認してください。
