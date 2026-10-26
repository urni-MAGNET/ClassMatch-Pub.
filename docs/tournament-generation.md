# 大会構造データとSVG

作成画面の「大会構造JSONを保存」は、その時点の全競技を再計算してJSONをダウンロードします。
未入力チームは `placeholder: true` の仮チームです。保存済みの大会データを変更する処理ではありません。

## 作成画面から生成

```js
const { generateCurrentTournamentJSON } = await import('/src/js/school/mypage/create-tournament-phase2.js');
const data = generateCurrentTournamentJSON();
console.log(data.sports[0].leagueMatchPairs);
console.log(data.sports[0].tournamentMatchPairs);
```

各リーグの `advanceTeams` から `リーグ名-1`、`リーグ名-2` の進出枠を生成します。
出場枠が「リーグの決勝進出枠」の場合、人数はそれらの合計です。
リーグが未確定でも、`sourceLeagueId` と `sourceRank` で進出枠を識別できます。

## 計算と描画

競技JSONの `format: "tournament"` は、チーム編集行と右側のトーナメントを表示します。
既存の表記 `"tornament"` も読み込めます。`tournament.teamCount` で初期人数を指定でき、
省略時は8チームです。追加・削除後は実際のチーム行数から再生成します。
この形式では参加チームをリーグ戦として数えません。スマホでは表の中だけ横スクロールできます。

```js
import { generateTournamentData } from '/src/js/classmatch/tournament-data.js';
import { measureTeamStartPoints, renderTournamentSVG } from '/src/js/classmatch/tournament-svg.js';

const data = generateTournamentData({
  teams: [{ teamId: 'a', teamName: 'A' }, { teamId: 'b', teamName: 'B' }],
  startPoints: measureTeamStartPoints(parent, teamElements),
  step: 120,
  prefix: 'soccer-bracket',
  sportId: 'soccer',
  sportName: 'サッカー'
});
parent.style.width = `${data.geometry.width}px`;
parent.style.height = `${data.geometry.height}px`;
renderTournamentSVG(data, parent);
```

`parent` はチームDOMとSVGを持つ `position: relative` の親要素です。
計算関数はDOMに依存しません。始点が省略された場合は固定間隔の座標を利用します。
描画関数は既存の線レイヤーだけを置換します。
人数変更時は、新しい参加チームとDOM始点で再計算してください。

## JSONの主要項目

| 項目 | 内容 |
| --- | --- |
| `sports[].leagueMatchPairs` | SVGと同じペア。チーム名・ID、リーグ名・ID、競技名・IDを含む |
| `sports[].tournamentMatchPairs` | 初戦から決勝までの試合データ |
| `tournament.rounds` | 回戦ごとの試合とシード |
| `match.order` | 試合順。先行する回戦から連番 |
| `match.dependsOn` | 確定待ちの先行試合ID |
| `match.teamA`, `match.teamB` | 実チーム、リーグ進出枠、または先行試合の勝者枠 |
| `match.winner`, `match.advancesTo` | 勝者の仮チームと進出先試合ID。最後は `champion` |
| `tournament.points` | `start-1` がDOM右端中央、`1-1` が右へ進んだ点。以降は中点から右へ進む |
| `tournament.drawPairs` | 接続する点IDのペア。試合のペアとは別データ |
| `tournament.roundPairs` | `Round1-1: ["1-1", "1-2"]` の形式で試合と点を対応付ける |
| `tournament.roundPoints` | 回戦別の点ID一覧 |
| `tournament.champion` | 優勝枠とその点ID |

5チームの場合は8枠に配置し、初回戦だけに3つのBYEを分散します。第2回戦以降にBYEはありません。
シードは試合数に数えません。8・7・5・3チームの試合数は7・6・4・2です。
このフェーズでは勝敗を確定せず、先行試合と順位を参照する仮データを生成します。
DBへの対戦表保存・勝敗更新は行いません。

## 検証

```sh
npm run test:tournament
npm run build
```

ブラウザ検証はPlaywrightとChromium（またはChrome）が必要です。
`npm run test:tournament:browser` はローカルソースをブラウザに渡し、認証・DB通信をスタブ化します。
表示名の更新、8・7・5・3チーム、進出枠、JSONダウンロード、スマホ表示を確認します。
必要なら `CLASSMATCH_PLAYWRIGHT_MODULE` にPlaywrightのモジュールURL、
`CLASSMATCH_BROWSER_EXECUTABLE` にブラウザの実行ファイルパスを指定できます。
