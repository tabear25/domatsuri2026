/* =============================================================================
 * 判定ロジックの検証（tests.html から読み込む）
 *
 * ビルドもテストランナーも使わない。tests.html をブラウザで開けば結果が出る。
 * 検証するのは app.js が window.DomatsuriLogic に公開した純粋関数だけ。
 * ========================================================================== */

(function () {
  "use strict";

  var L = window.DomatsuriLogic;
  var V = window.DOMATSURI_DATA.venues;
  var results = [];

  function check(name, actual, expected) {
    var passed = String(actual) === String(expected);
    results.push({ name: name, passed: passed, actual: actual, expected: expected });
  }

  function checkTrue(name, condition, detail) {
    results.push({ name: name, passed: !!condition, actual: detail || condition, expected: "true" });
  }

  /* ---- A. 判定の境界値。ここを間違えると仕様違反になる ------------------ */

  check("余裕21分 → ばっちり", L.judge(21).key, "best");
  check("余裕20分 → ばっちり（境界）", L.judge(20).key, "best");
  check("余裕19分 → 行ける（境界）", L.judge(19).key, "good");
  check("余裕15分 → 行ける", L.judge(15).key, "good");
  check("余裕10分 → 行ける（境界）", L.judge(10).key, "good");
  check("余裕9分 → ギリギリ（境界）", L.judge(9).key, "tight");
  check("余裕0分 → ギリギリ（境界）", L.judge(0).key, "tight");
  check("余裕-1分 → むずかしい（境界）", L.judge(-1).key, "hard");
  check("余裕-30分 → むずかしい", L.judge(-30).key, "hard");

  /* ---- B. 時刻のパースと整形 -------------------------------------------- */

  check('"14:20" → 860分', L.toMinutes("14:20"), 860);
  check('"09:05" → 545分', L.toMinutes("09:05"), 545);
  check('"9:05" も読める', L.toMinutes("9:05"), 545);
  check('"25:00" は不正', L.toMinutes("25:00"), null);
  check('"14:60" は不正', L.toMinutes("14:60"), null);
  check('"あいう" は不正', L.toMinutes("あいう"), null);
  check("860分 → 14:20", L.toHHMM(860), "14:20");
  check("545分 → 9:05", L.toHHMM(545), "9:05");

  /* ---- C. 距離と徒歩時間 ------------------------------------------------ */

  var oneHundredMetersNorth = { lat: V.hisaya_main.lat + 0.0008993, lng: V.hisaya_main.lng };
  var distance100 = L.haversineMeters(V.hisaya_main, oneHundredMetersNorth);
  checkTrue("緯度0.0008993度差 ≒ 100m", Math.abs(distance100 - 100) < 2, Math.round(distance100) + "m");
  check("100m離れた地点 → 徒歩2分（ceil(100×1.3÷80)）",
    L.walkMinutes(V.hisaya_main, oneHundredMetersNorth), 2);

  check("同じ会場 → 徒歩0分", L.walkMinutes(V.oasis21, V.oasis21), 0);

  var hisayaToTvTower = L.walkMinutes(V.hisaya_main, V.tv_tower);
  checkTrue("久屋大通MS→テレビ塔が0分になっていない（座標の使い回し検出）",
    hisayaToTvTower > 0, hisayaToTvTower + "分");
  checkTrue("久屋大通MS→テレビ塔は5〜20分の範囲",
    hisayaToTvTower >= 5 && hisayaToTvTower <= 20, hisayaToTvTower + "分");

  var sakaeToMeieki = L.walkMinutes(V.hisaya_main, V.jr_towers);
  checkTrue("久屋大通MS→名駅JRタワーズは30分以上（徒歩では遠い）",
    sakaeToMeieki >= 30, sakaeToMeieki + "分");

  var oasisToTvTower = L.walkMinutes(V.oasis21, V.tv_tower);
  checkTrue("オアシス21→テレビ塔は5分以内（隣接）",
    oasisToTvTower <= 5, oasisToTvTower + "分");

  /* ---- C2. Google マップの URL ------------------------------------------ */

  var oasisDirections = L.directionsUrl(V.oasis21);
  checkTrue("道案内URLは dir/?api=1 形式", oasisDirections.indexOf("/maps/dir/?api=1") > 0, oasisDirections);
  checkTrue("道案内URLに origin を含めない（Google側が現在地を使う）",
    oasisDirections.indexOf("origin=") === -1, oasisDirections);
  checkTrue("道案内URLは徒歩モード", oasisDirections.indexOf("travelmode=walking") > 0, oasisDirections);
  checkTrue("道案内URLの目的地は座標",
    oasisDirections.indexOf(encodeURIComponent(V.oasis21.lat + "," + V.oasis21.lng)) > 0, oasisDirections);

  var walkRoute = L.routeUrl(V.hisaya_main, V.jr_towers, "walking");
  checkTrue("区間ルートURLに origin がある", walkRoute.indexOf("origin=") > 0, walkRoute);
  checkTrue("区間ルートURLに destination がある", walkRoute.indexOf("destination=") > 0, walkRoute);
  var transitRoute = L.routeUrl(V.hisaya_main, V.jr_towers, "transit");
  checkTrue("電車ルートURLは transit モード", transitRoute.indexOf("travelmode=transit") > 0, transitRoute);

  /* ---- C3. 電車ルートを出す距離のしきい値 -------------------------------- */

  var hint = window.DOMATSURI_DATA.transitHintMeters;
  var sakaeToMeiekiMeters = L.haversineMeters(V.hisaya_main, V.jr_towers);
  checkTrue("栄→名駅はしきい値を超える（電車リンクが出る）",
    sakaeToMeiekiMeters >= hint, Math.round(sakaeToMeiekiMeters) + "m / しきい値" + hint + "m");
  var oasisToTvMeters = L.haversineMeters(V.oasis21, V.tv_tower);
  checkTrue("オアシス21→テレビ塔はしきい値未満（電車リンクは出ない）",
    oasisToTvMeters < hint, Math.round(oasisToTvMeters) + "m / しきい値" + hint + "m");
  var castleToOsuMeters = L.haversineMeters(V.nagoya_castle, V.osu_kannon);
  checkTrue("名古屋城→大須観音はしきい値を超える（電車リンクが出る）",
    castleToOsuMeters >= hint, Math.round(castleToOsuMeters) + "m / しきい値" + hint + "m");

  /* ---- D. 演舞の組み立て ------------------------------------------------ */

  var fixture = {
    defaultDurationMin: 10,
    teams: [{ id: "a", name: "A", color: "#000" }, { id: "b", name: "B", color: "#111" }],
    venues: V,
    performances: [
      // わざと時刻順を崩して入れる
      { teamId: "b", venueId: "oasis21",     start: "15:00", end: "15:10" },
      { teamId: "a", venueId: "hisaya_main", start: "14:00", end: "14:10" },
      { teamId: "b", venueId: "hisaya_main", start: "16:00", end: null    },
    ],
  };

  L.resetProblems();
  var entries = L.buildEntries(fixture);
  check("開始時刻の昇順に並ぶ（先頭）", L.toHHMM(entries[0].startMin), "14:00");
  check("開始時刻の昇順に並ぶ（末尾）", L.toHHMM(entries[2].startMin), "16:00");
  check("終了時刻ありは推定にならない", entries[0].endIsEstimated, false);
  check("終了時刻なしは推定になる", entries[2].endIsEstimated, true);
  check("終了時刻なしは開始+10分", L.toHHMM(entries[2].endMin), "16:10");
  check("正常データでは問題ゼロ", L.getProblems().length, 0);

  var pairs = L.buildPairs(entries);
  check("3件の演舞からペアは2件", pairs.length, 2);
  check("異なるチームのペアと判定される", pairs[0].isCrossTeam, true);
  check("同じチームのペアと判定される", pairs[1].isCrossTeam, false);

  // 久屋大通MS 14:10終 → オアシス21 15:00開。徒歩を引いた余裕が正で、段階も出る
  checkTrue("ペアに徒歩時間が入る", pairs[0].walk !== null, pairs[0].walk + "分");
  check("余裕 = 50分 − 徒歩", pairs[0].slack, 50 - pairs[0].walk);
  checkTrue("ペアに判定が付く", !!pairs[0].level, pairs[0].level && pairs[0].level.key);

  /* ---- E. エッジケース -------------------------------------------------- */

  L.resetProblems();
  var dateFiltered = L.buildEntries({
    defaultDurationMin: 5, teams: fixture.teams, venues: V,
    performances: [
      { date: "2026-08-29", teamId: "a", venueId: "oasis21",     start: "18:55", end: null },
      { date: "2026-08-30", teamId: "a", venueId: "hisaya_main", start: "12:15", end: null },
      { date: "2026-08-30", teamId: "b", venueId: "gurume",      start: "14:00", end: null },
    ],
  }, "2026-08-30");
  check("選んだ日以外の演舞は除外される", dateFiltered.length, 2);
  check("除外後も開始時刻順", L.toHHMM(dateFiltered[0].startMin), "12:15");

  L.resetProblems();
  L.buildEntries({
    defaultDurationMin: 5, teams: fixture.teams, venues: V,
    performances: [{ teamId: "a", venueId: "oasis21", start: "12:00", end: null }],
  }, "2026-08-30");
  checkTrue("date のない演舞を検出する（黙って消さない）",
    L.getProblems().length > 0, L.getProblems()[0]);

  L.resetProblems();
  var singleEntry = L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [{ teamId: "a", venueId: "oasis21", start: "12:00", end: "12:10" }],
  });
  check("演舞1件ならペアは0件", L.buildPairs(singleEntry).length, 0);

  L.resetProblems();
  var overlapping = L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [
      { teamId: "a", venueId: "hisaya_main", start: "14:20", end: "14:30" },
      { teamId: "b", venueId: "oasis21",     start: "14:25", end: "14:35" },
    ],
  });
  var overlapPair = L.buildPairs(overlapping)[0];
  checkTrue("時間が被るペアは余裕がマイナス", overlapPair.slack < 0, overlapPair.slack + "分");
  check("時間が被るペアはむずかしい", overlapPair.level.key, "hard");

  L.resetProblems();
  var sameVenue = L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [
      { teamId: "a", venueId: "gurume", start: "14:00", end: "14:10" },
      { teamId: "b", venueId: "gurume", start: "14:30", end: "14:40" },
    ],
  });
  var sameVenuePair = L.buildPairs(sameVenue)[0];
  check("同一会場の連続は徒歩0分", sameVenuePair.walk, 0);
  check("同一会場の連続は余裕20分", sameVenuePair.slack, 20);
  check("余裕20分はばっちり", sameVenuePair.level.key, "best");

  /* ---- F. データ不備の検出 ---------------------------------------------- */

  L.resetProblems();
  L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [{ teamId: "a", venueId: "存在しない会場", start: "14:00", end: "14:10" }],
  });
  checkTrue("存在しない会場IDを検出する", L.getProblems().length > 0, L.getProblems()[0]);

  L.resetProblems();
  L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [{ teamId: "a", venueId: "aeon_atsuta_hiroba", start: "14:00", end: "14:10" }],
  });
  checkTrue("中止になった会場を検出する", L.getProblems().length > 0, L.getProblems()[0]);

  L.resetProblems();
  L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [{ teamId: "a", venueId: "oasis21", start: "14:30", end: "14:10" }],
  });
  checkTrue("終了が開始より前なのを検出する", L.getProblems().length > 0, L.getProblems()[0]);

  L.resetProblems();
  L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [{ teamId: "a", venueId: "oasis21", start: "14:00", end: "14:7" }],
  });
  checkTrue("読めない終了時刻を検出する（推定に紛れ込ませない）",
    L.getProblems().length > 0, L.getProblems()[0]);

  L.resetProblems();
  L.buildEntries({
    defaultDurationMin: 10, teams: fixture.teams, venues: V,
    performances: [{ teamId: "存在しないチーム", venueId: "oasis21", start: "14:00", end: "14:10" }],
  });
  checkTrue("存在しないチームIDを検出する", L.getProblems().length > 0, L.getProblems()[0]);

  /* ---- G. 会場マスタそのものの健全性 ------------------------------------ */

  var venueIds = Object.keys(V);
  check("会場マスタは16件（うち1件は中止）", venueIds.length, 16);

  var missingCoordinates = venueIds.filter(function (id) {
    return typeof V[id].lat !== "number" || typeof V[id].lng !== "number";
  });
  check("全会場に緯度経度がある", missingCoordinates.length, 0);

  var outsideNagoya = venueIds.filter(function (id) {
    var venue = V[id];
    return venue.lat < 35.0 || venue.lat > 35.3 || venue.lng < 136.8 || venue.lng > 137.1;
  });
  check("全会場が名古屋市内の座標範囲に収まる", outsideNagoya.length, 0);

  var duplicateCoordinates = [];
  venueIds.forEach(function (idA, i) {
    venueIds.slice(i + 1).forEach(function (idB) {
      if (V[idA].cancelled || V[idB].cancelled) return; // 中止会場は同座標で構わない
      if (V[idA].lat === V[idB].lat && V[idA].lng === V[idB].lng) {
        duplicateCoordinates.push(idA + " と " + idB);
      }
    });
  });
  check("座標が完全に重複した会場はない", duplicateCoordinates.join(", ") || "なし", "なし");

  /* ---- H. 日付タブ ------------------------------------------------------- */

  var D = window.DOMATSURI_DATA;
  var dayDates = D.eventDays.map(function (day) { return day.date; });
  check("タブは3日ぶん", D.eventDays.length, 3);
  check("タブの並びは 8/28 → 8/29 → 8/30",
    dayDates.join(","), "2026-08-28,2026-08-29,2026-08-30");
  check("日付ラベルの整形", L.dayLabel("2026-08-30"), "8/30 (日)");

  check("URLで指定した日が選ばれる",
    L.resolveSelectedDate({ day: "2026-08-29" }, "2026-08-25"), "2026-08-29");
  check("今日が開催日ならその日が開く",
    L.resolveSelectedDate({}, "2026-08-29"), "2026-08-29");
  check("開催期間外なら既定日が開く",
    L.resolveSelectedDate({}, "2026-08-25"), D.defaultDate);
  check("開催日にない日を指定しても既定にフォールバックする",
    L.resolveSelectedDate({ day: "2026-01-01" }, "2026-08-25"), D.defaultDate);
  check("URL指定は今日より優先される",
    L.resolveSelectedDate({ day: "2026-08-28" }, "2026-08-30"), "2026-08-28");

  check("8/28 の演舞件数", L.countPerformances("2026-08-28"), 0);
  check("8/29 の演舞件数", L.countPerformances("2026-08-29"), 2);
  check("8/30 の演舞件数", L.countPerformances("2026-08-30"), 10);

  L.resetProblems();
  check("8/29 は八雲一座だけ",
    L.buildEntries(null, "2026-08-29").map(function (e) { return e.team.name; })
      .filter(function (name, i, all) { return all.indexOf(name) === i; }).join(","),
    "八雲一座");
  check("8/30 は2チームぶん出る",
    L.buildEntries(null, "2026-08-30").map(function (e) { return e.team.id; })
      .filter(function (id, i, all) { return all.indexOf(id) === i; }).length, 2);
  check("8/28 は演舞ゼロ", L.buildEntries(null, "2026-08-28").length, 0);
  check("演舞ゼロの日はペアもゼロ", L.buildPairs(L.buildEntries(null, "2026-08-28")).length, 0);
  check("実データの読み込みで問題は出ない", L.getProblems().length, 0);

  /* ---- 結果の描画 -------------------------------------------------------- */

  var failed = results.filter(function (r) { return !r.passed; });
  var summary = failed.length === 0
    ? "全 " + results.length + " 件パス"
    : results.length + " 件中 " + failed.length + " 件が失敗";

  var rows = results.map(function (r) {
    return '<tr class="' + (r.passed ? "pass" : "fail") + '">' +
      "<td>" + (r.passed ? "OK" : "NG") + "</td>" +
      "<td>" + r.name + "</td>" +
      "<td>" + r.actual + "</td>" +
      "<td>" + r.expected + "</td>" +
      "</tr>";
  }).join("");

  document.getElementById("results").innerHTML =
    '<p class="summary ' + (failed.length === 0 ? "pass" : "fail") + '">' + summary + "</p>" +
    "<table><thead><tr><th>結果</th><th>項目</th><th>実際</th><th>期待</th></tr></thead>" +
    "<tbody>" + rows + "</tbody></table>";
})();
