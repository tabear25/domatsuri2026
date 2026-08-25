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
  checkTrue("道案内URLは既定で徒歩モード", oasisDirections.indexOf("travelmode=walking") > 0, oasisDirections);
  var oasisTransitDirections = L.directionsUrl(V.oasis21, "transit");
  checkTrue("道案内URLは電車モードも作れる",
    oasisTransitDirections.indexOf("travelmode=transit") > 0, oasisTransitDirections);
  checkTrue("電車モードの道案内URLにも origin を含めない",
    oasisTransitDirections.indexOf("origin=") === -1, oasisTransitDirections);
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

  /* ---- C4. 電車の所要時間 ------------------------------------------------ */

  var DATA = window.DOMATSURI_DATA;

  // イオン熱田 → ぐるめぱーく = 金山まで徒歩15 + 待ち4 + 名城線3駅6 + 会場まで徒歩1
  var aeonToGurume = L.transitMinutes(V.aeon_atsuta, V.gurume);
  check("イオン熱田→ぐるめぱーくは電車26分（15+4+6+1）", aeonToGurume.minutes, 26);
  check("その区間の乗る駅は金山", aeonToGurume.fromStation, "金山");
  check("その区間は実測の区間データを使う", aeonToGurume.isEstimated, false);

  // 平針 → イオン熱田 = 徒歩3 + 待ち4 + 乗車30 + 徒歩15
  check("平針→イオン熱田は電車52分（3+4+30+15）",
    L.transitMinutes(V.hirabari, V.aeon_atsuta).minutes, 52);

  check("最寄り駅が同じ会場どうしは電車の見積もりを出さない",
    L.transitMinutes(V.hisaya_main, V.gurume), null);
  check("同じ会場どうしも電車の見積もりを出さない",
    L.transitMinutes(V.oasis21, V.oasis21), null);

  check("本数の少ない道徳駅の待ちは8分", L.boardingWaitMinutes(DATA, "道徳"), 8);
  check("それ以外の駅の待ちは既定値", L.boardingWaitMinutes(DATA, "栄"), DATA.boardingWaitMin);

  checkTrue("区間表は逆向きでも同じエントリを引く",
    L.findStationRide(DATA, "平針", "金山") === L.findStationRide(DATA, "金山", "平針"),
    "同一オブジェクト");
  check("区間表に無い駅の組み合わせは null",
    L.findStationRide(DATA, "太閤通", "平針"), null);

  // 区間表に無いところは直線距離からの概算に落ちる。黙って徒歩に戻さない。
  var fallbackPlan = L.transitMinutes(V.ekinishi_ginza, V.hirabari);
  check("区間表に無い組み合わせは概算になる", fallbackPlan.isEstimated, true);
  checkTrue("概算でも分数が出る", fallbackPlan.minutes > 0, fallbackPlan.minutes + "分");

  /* ---- C5. 徒歩と電車のどちらを採るか ------------------------------------ */

  var farPlan = L.travelPlan(V.aeon_atsuta, V.gurume);
  check("遠い区間は電車を採る", farPlan.mode, "transit");
  check("そのときの移動時間は電車の値", farPlan.minutes, 26);
  checkTrue("徒歩の値も残っている（電車より遅い）",
    farPlan.walkMin > farPlan.minutes, "徒歩" + farPlan.walkMin + "分");

  var nextDoorPlan = L.travelPlan(V.oasis21, V.tv_tower);
  check("隣接する会場は徒歩のまま", nextDoorPlan.mode, "walk");

  // 電車が2〜3分速いだけの区間で地下に潜らせない
  var marginalPlan = L.travelPlan(V.oasis21, V.hisaya_main);
  check("電車がわずかに速いだけなら徒歩のまま", marginalPlan.mode, "walk");
  checkTrue("そのとき電車のほうが速いこと自体は認識している",
    marginalPlan.transit.minutes < marginalPlan.walkMin,
    "電車" + marginalPlan.transit.minutes + "分 / 徒歩" + marginalPlan.walkMin + "分");
  checkTrue("差が transitAdvantageMin 未満だから徒歩を残している",
    marginalPlan.walkMin - marginalPlan.transit.minutes < DATA.transitAdvantageMin,
    "差" + (marginalPlan.walkMin - marginalPlan.transit.minutes) + "分 / しきい値" +
      DATA.transitAdvantageMin + "分");

  check("同じ会場は0分", L.travelPlan(V.gurume, V.gurume).minutes, 0);
  check("同じ会場のモードは same", L.travelPlan(V.gurume, V.gurume).mode, "same");

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

  // 久屋大通MS 14:10終 → オアシス21 15:00開。移動時間を引いた余裕が正で、段階も出る
  checkTrue("ペアに移動時間が入る", pairs[0].travel !== null, pairs[0].travel.minutes + "分");
  check("余裕 = 50分 − 移動時間", pairs[0].slack, 50 - pairs[0].travel.minutes);
  checkTrue("ペアに判定が付く", !!pairs[0].level, pairs[0].level && pairs[0].level.key);
  check("開始時刻が違うペアは同時刻扱いにしない", pairs[0].isSimultaneous, false);

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
  check("同一会場の連続は移動0分", sameVenuePair.travel.minutes, 0);
  check("同一会場の連続は余裕20分", sameVenuePair.slack, 20);
  check("余裕20分はばっちり", sameVenuePair.level.key, "best");

  L.resetProblems();
  var simultaneous = L.buildEntries({
    defaultDurationMin: 5, teams: fixture.teams, venues: V,
    performances: [
      { teamId: "a", venueId: "nadya",     start: "16:06", end: null },
      { teamId: "b", venueId: "agf_sakae", start: "16:06", end: null },
    ],
  });
  var simultaneousPair = L.buildPairs(simultaneous)[0];
  check("開始時刻が同じペアには同時刻の印が付く", simultaneousPair.isSimultaneous, true);
  check("同時刻のペアはむずかしい", simultaneousPair.level.key, "hard");

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

  var missingStation = venueIds.filter(function (id) {
    return !V[id].station || typeof V[id].stationWalkMin !== "number";
  });
  check("全会場に最寄り駅と徒歩分がある", missingStation.join(", ") || "なし", "なし");

  var badRides = Object.keys(DATA.stationRides).filter(function (key) {
    var ride = DATA.stationRides[key];
    return key.indexOf("|") <= 0 || typeof ride.min !== "number" || !ride.via;
  });
  check("区間表の各行に分数と経路がある", badRides.join(", ") || "なし", "なし");

  var ridesToUnknownStation = [];
  var knownStations = {};
  venueIds.forEach(function (id) { knownStations[V[id].station] = true; });
  Object.keys(DATA.stationRides).forEach(function (key) {
    key.split("|").forEach(function (station) {
      // 乗換駅は会場の最寄りでなくてよいが、区間表の端点は必ず会場の最寄り駅
      if (!knownStations[station]) ridesToUnknownStation.push(station);
    });
  });
  check("区間表の駅名はすべて会場の最寄り駅",
    ridesToUnknownStation.join(", ") || "なし", "なし");

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

  check("8/28 の演舞件数", L.countPerformances("2026-08-28"), 2);
  check("8/29 の演舞件数", L.countPerformances("2026-08-29"), 10);
  check("8/30 の演舞件数", L.countPerformances("2026-08-30"), 8);
  check("3日の合計は20演舞", D.performances.length, 20);

  L.resetProblems();
  check("8/28 は八雲一座だけ",
    L.buildEntries(null, "2026-08-28").map(function (e) { return e.team.name; })
      .filter(function (name, i, all) { return all.indexOf(name) === i; }).join(","),
    "八雲一座");
  check("8/29 は2チームぶん出る",
    L.buildEntries(null, "2026-08-29").map(function (e) { return e.team.id; })
      .filter(function (id, i, all) { return all.indexOf(id) === i; }).length, 2);
  check("8/30 も2チームぶん出る",
    L.buildEntries(null, "2026-08-30").map(function (e) { return e.team.id; })
      .filter(function (id, i, all) { return all.indexOf(id) === i; }).length, 2);
  check("開催日でない日は演舞ゼロ", L.buildEntries(null, "2026-08-27").length, 0);
  check("演舞ゼロの日はペアもゼロ", L.buildPairs(L.buildEntries(null, "2026-08-27")).length, 0);
  check("実データの読み込みで問題は出ない", L.getProblems().length, 0);

  /* ---- I. 実データでの判定 -----------------------------------------------
   * data.js を書き換えたときに、当日の結論が黙って変わっていないかを見る。
   * ---------------------------------------------------------------------- */

  function pairBetween(pairs, fromVenueId, toVenueId) {
    var found = null;
    pairs.forEach(function (pair) {
      if (pair.from.venueId === fromVenueId && pair.to.venueId === toVenueId) found = pair;
    });
    return found;
  }

  L.resetProblems();
  var saturday = L.buildPairs(L.buildEntries(null, "2026-08-29"));
  var sunday = L.buildPairs(L.buildEntries(null, "2026-08-30"));

  // スケジュール上の乗り継ぎが、概算ではなく実測の区間データで判定されていること
  var estimatedLegs = [];
  saturday.concat(sunday).forEach(function (pair) {
    if (pair.travel && pair.travel.transit && pair.travel.transit.isEstimated &&
        pair.travel.mode === "transit") {
      estimatedLegs.push(pair.from.venueId + "→" + pair.to.venueId);
    }
  });
  check("電車を採用した区間はすべて区間表にある（概算に落ちていない）",
    estimatedLegs.join(", ") || "なし", "なし");

  var gurumeToHirabari = pairBetween(saturday, "gurume", "hirabari");
  check("8/29 ぐるめぱーく→平針は電車で判定する", gurumeToHirabari.travel.mode, "transit");
  check("8/29 ぐるめぱーく→平針はむずかしい", gurumeToHirabari.level.key, "hard");

  var hirabariToAeon = pairBetween(saturday, "hirabari", "aeon_atsuta");
  check("8/29 平針→イオン熱田は電車で判定する", hirabariToAeon.travel.mode, "transit");
  check("8/29 平針→イオン熱田はばっちり", hirabariToAeon.level.key, "best");
  checkTrue("8/29 平針→イオン熱田は徒歩換算だと間に合わない区間",
    hirabariToAeon.travel.walkMin > 60, "徒歩" + hirabariToAeon.travel.walkMin + "分");

  var aeonToGurumePair = pairBetween(saturday, "aeon_atsuta", "gurume");
  check("8/29 イオン熱田→ぐるめぱーくはむずかしい", aeonToGurumePair.level.key, "hard");
  checkTrue("8/29 イオン熱田→ぐるめぱーくの不足は10分未満（電車なら惜しいところまで来る）",
    aeonToGurumePair.slack < 0 && aeonToGurumePair.slack > -10,
    aeonToGurumePair.slack + "分");

  var castleToDotoku = pairBetween(sunday, "nagoya_castle", "dotoku");
  check("8/30 名古屋城→どうとくは電車で判定する", castleToDotoku.travel.mode, "transit");
  check("8/30 名古屋城→どうとくはばっちり", castleToDotoku.level.key, "best");

  var dotokuToOasis = pairBetween(sunday, "dotoku", "oasis21");
  check("8/30 どうとく→オアシス21はばっちり", dotokuToOasis.level.key, "best");
  check("8/30 どうとく発は道徳駅の長い待ちを使う", dotokuToOasis.travel.transit.waitMin, 8);

  var nadyaToSakae = pairBetween(sunday, "nadya", "agf_sakae");
  check("8/30 16:06の2件は同時刻の印が付く", nadyaToSakae.isSimultaneous, true);
  check("8/30 16:06の2件はむずかしい", nadyaToSakae.level.key, "hard");

  check("実データの判定でも問題は出ない", L.getProblems().length, 0);

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
