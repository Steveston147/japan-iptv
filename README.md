# Japan IPTV M3U

公開されている日本向け IPTV リストを取得・整理して、M3Uとして返すVercel用プロジェクトです。

## M3U URL

### 日本テレビ局・充実版（おすすめ）

`Mvb1122/jp-iptv-different-user` の更新リストを利用します。地上波、BS、CS、ニュース、スポーツなどを幅広く残し、成人向け、パチンコ・公営競技、通販を除外します。元リストのEPG、ロゴ、VLC向けUser-Agent指定も保持します。

```
https://<your-vercel-domain>/api/reaperc-clean.m3u
```

### IPTV-org整理版

IPTV-orgの日本向けストリームを取得し、地上波のコールサインを分かりやすい局名へ変換します。通販3局を除外し、NHK WORLD-JAPANの重複を1局に整理します。

```
https://<your-vercel-domain>/api/iptv-org.m3u
```

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

## 各リストの注意点

- 日本テレビ局・充実版はチャンネル数が多い一方、第三者の中継URLを含み、配信停止・地域制限・プレイヤーとの相性が発生することがあります。
- IPTV-org整理版は公開・公式系中心のため、チャンネル数が少なめです。
- Full版とStable版は `tareq236/JapanIPTV/jp_tv_channels.json` を利用します。
- VercelはM3Uを生成するだけで、映像自体を中継しません。プレイヤーは各配信元へ直接接続します。
- 各配信元の利用条件および視聴地域の法令を確認してください。

## 既存JSON版の仕様

- `url` と `url_free_tv` の両方を利用
- 地上波（terrestrial）・BS・CSの一般放送を収録
- ニュース・天気・経済情報は収録
- 成人向け、グラビア、ギャンブル、通販、内容不明の項目を除外
- URL形式が不正な項目、応答しない項目を除外
- Stable版では実績のある公開配信基盤だけを採用
- Stable版では取得内容が有効なHLSプレイリスト（#EXTM3U）であることを確認
- 重複URLを除外
- Vercel CDNで15分キャッシュ
