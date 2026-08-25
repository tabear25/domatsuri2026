(function () {
  "use strict";

  var DATA = window.DOMATSURI_DATA;

  var LEVELS = [
    { key: "best",  minSlack: 20,        icon: "☀️", face: "😄", label: "ばっちり" },
    { key: "good",  minSlack: 10,        icon: "⛅️", face: "😊", label: "行ける" },
    { key: "tight", minSlack: 0,         icon: "🌧️", face: "😐", label: "ギリギリ" },
    { key: "hard",  minSlack: -Infinity, icon: "⛈️", face: "😢", label: "むずかしい" }
  ];

  function judge(slackMinutes) {
    for (var i = 0; i < LEVELS.length; i++) {
      if (slackMinutes >= LEVELS[i].minSlack) return LEVELS[i];
    }
    return LEVELS[LEVELS.length - 1];
  }

  function toMinutes(hhmm) {
    var matched = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
    if (!matched) return null;
    var hour = Number(matched[1]);
    var minute = Number(matched[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  function toHHMM(minutes) {
    var hour = Math.floor(minutes / 60);
    var minute = minutes % 60;
    return String(hour) + ":" + String(minute).padStart(2, "0");
  }

  function jstNowParts() {
    var formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false
    });
    var parts = {};
    formatter.formatToParts(new Date()).forEach(function (part) {
      parts[part.type] = part.value;
    });
    var hour = Number(parts.hour) % 24;
    return {
      date: parts.year + "-" + parts.month + "-" + parts.day,
      minutes: hour * 60 + Number(parts.minute)
    };
  }

  function readQuery() {
    var query = new URLSearchParams(window.location.search);
    return {
      day: query.get("day"),     // タブで選んだ「表示する日」
      now: query.get("now"),     // 検証用: 現在時刻の上書き
      today: query.get("today"), // 検証用: 今日の日付の上書き
    };
  }

  /** タブの選択を保ったまま日だけ差し替えたリンク先を作る。 */
  function hrefForDay(date) {
    var query = new URLSearchParams(window.location.search);
    query.set("day", date);
    return "?" + query.toString();
  }

  function findDay(date) {
    var found = null;
    DATA.eventDays.forEach(function (day) {
      if (day.date === date) found = day;
    });
    return found;
  }

  function dayLabel(date) {
    var day = findDay(date);
    return day ? day.label + " (" + day.weekday + ")" : date;
  }

  function resolveSelectedDate(query, todayDate) {
    if (query.day && findDay(query.day)) return query.day;
    if (findDay(todayDate)) return todayDate;
    return DATA.defaultDate;
  }

  function countPerformances(date) {
    return DATA.performances.filter(function (performance) {
      return performance.date === date;
    }).length;
  }

  function haversineMeters(from, to) {
    var earthRadius = 6371000;
    var toRadians = function (degree) { return (degree * Math.PI) / 180; };
    var deltaLat = toRadians(to.lat - from.lat);
    var deltaLng = toRadians(to.lng - from.lng);
    var fromLat = toRadians(from.lat);
    var toLat = toRadians(to.lat);
    var a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
            Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function walkMinutes(fromVenue, toVenue) {
    if (fromVenue === toVenue) return 0;
    var straightMeters = haversineMeters(fromVenue, toVenue);
    var walkingMeters = straightMeters * DATA.detourFactor;
    return Math.ceil(walkingMeters / DATA.walkSpeedMPerMin);
  }
  var problems = [];

  function buildEntries(source, targetDate) {
    var data = source || DATA;
    var teamById = {};
    data.teams.forEach(function (team) { teamById[team.id] = team; });

    var todaysPerformances = data.performances.filter(function (performance) {
      if (!targetDate) return true;
      if (!performance.date) {
        problems.push("date が書かれていない演舞があります（" +
          performance.start + " " + performance.teamId + "）");
        return false;
      }
      return performance.date === targetDate;
    });

    var entries = todaysPerformances.map(function (performance, index) {
      var venue = data.venues[performance.venueId];
      var team = teamById[performance.teamId];
      if (!venue) {
        problems.push("会場ID「" + performance.venueId + "」が venues にありません（" + performance.start + " の演舞）");
      } else if (venue.cancelled) {
        problems.push("「" + venue.name + "」は中止になった会場です（" + performance.start + " の演舞）");
      }
      if (!team) {
        problems.push("チームID「" + performance.teamId + "」が teams にありません（" + performance.start + " の演舞）");
      }

      var startMin = toMinutes(performance.start);
      if (startMin === null) {
        problems.push("開始時刻「" + performance.start + "」を読めません");
      }

      // 終了時刻は「未指定」と「書いてあるが読めない」を区別する。
      // 後者を黙って推定値で埋めると、typo が推定バッジに紛れて気づけなくなる。
      var endMin = null;
      var endIsEstimated = false;
      if (performance.end) {
        endMin = toMinutes(performance.end);
        if (endMin === null) {
          problems.push("終了時刻「" + performance.end + "」を読めません（" + performance.start + " の演舞）");
        }
      }
      if (endMin === null && startMin !== null) {
        endMin = startMin + data.defaultDurationMin;
        endIsEstimated = true;
      }
      if (startMin !== null && endMin !== null && endMin < startMin) {
        problems.push("終了時刻が開始時刻より前です（" + performance.start + " → " + performance.end + "）");
      }

      return {
        index: index,
        team: team || { id: performance.teamId, name: performance.teamId, color: "#666666" },
        venue: venue || null,
        venueId: performance.venueId,
        startMin: startMin === null ? 0 : startMin,
        endMin: endMin === null ? 0 : endMin,
        endIsEstimated: endIsEstimated
      };
    });

    entries.sort(function (a, b) {
      if (a.startMin !== b.startMin) return a.startMin - b.startMin;
      return a.endMin - b.endMin;
    });
    return entries;
  }

  /** 時系列で隣り合う演舞のペアを作り、それぞれの余裕分を判定する。 */
  function buildPairs(entries) {
    var pairs = [];
    for (var i = 0; i < entries.length - 1; i++) {
      var from = entries[i];
      var to = entries[i + 1];
      var hasBothVenues = !!(from.venue && to.venue);
      var walk = hasBothVenues ? walkMinutes(from.venue, to.venue) : null;
      var straight = hasBothVenues ? haversineMeters(from.venue, to.venue) : null;
      var slack = walk === null ? null : to.startMin - from.endMin - walk;
      pairs.push({
        from: from,
        to: to,
        walk: walk,
        straight: straight,
        slack: slack,
        level: slack === null ? null : judge(slack),
        isCrossTeam: from.team.id !== to.team.id
      });
    }
    return pairs;
  }

  /* ---------------------------------------------------------------------
   * 描画
   * ------------------------------------------------------------------- */

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * 現在地から会場までの徒歩ルートを Google マップで開く URL。
   * origin を省略すると Google 側が現在地を出発地として扱うので、
   * このページで位置情報の許可を取る必要がない。
   */
  function directionsUrl(venue) {
    return "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(venue.lat + "," + venue.lng) + "&travelmode=walking";
  }

  /**
   * 会場から会場へのルートを Google マップで開く URL。
   * こちらの徒歩見積もりは直線距離からの概算なので、
   * 判断に迷う区間は Google の実測に当たれるようにしておく。
   */
  function routeUrl(fromVenue, toVenue, travelMode) {
    return "https://www.google.com/maps/dir/?api=1" +
      "&origin=" + encodeURIComponent(fromVenue.lat + "," + fromVenue.lng) +
      "&destination=" + encodeURIComponent(toVenue.lat + "," + toVenue.lng) +
      "&travelmode=" + travelMode;
  }

  function renderDayTabs(state) {
    var tabs = DATA.eventDays.map(function (day) {
      var count = countPerformances(day.date);
      var classNames = ["day-tab"];
      if (day.date === state.selectedDate) classNames.push("selected");
      if (day.date === state.todayDate) classNames.push("is-today");
      return '<a class="' + classNames.join(" ") + '" href="' + escapeHtml(hrefForDay(day.date)) + '">' +
        '<span class="day-tab-date">' + escapeHtml(day.label) +
          '<span class="day-tab-weekday">' + escapeHtml(day.weekday) + "</span></span>" +
        '<span class="day-tab-count">' + (count === 0 ? "演舞なし" : count + "演舞") + "</span>" +
        "</a>";
    }).join("");
    return '<nav class="day-tabs">' + tabs + "</nav>";
  }

  function renderHeader(state) {
    var status;
    if (state.isLiveDay && state.nextEntry) {
      var until = state.nextEntry.startMin - state.nowMinutes;
      status = '<div class="header-status live">ただいま ' + toHHMM(state.nowMinutes) +
        " ／ 次の演舞まで <strong>" + until + "分</strong></div>";
    } else if (state.isLiveDay) {
      status = '<div class="header-status live">ただいま ' + toHHMM(state.nowMinutes) +
        " ／ この日の演舞は終了</div>";
    } else {
      status = '<div class="header-status">' + escapeHtml(dayLabel(state.selectedDate)) +
        " の予定を見ています</div>";
    }

    return '<header class="app-header">' +
      '<div class="header-title">' + escapeHtml(DATA.eventTitle) + "</div>" +
      renderDayTabs(state) +
      status +
      "</header>";
  }

  function renderTeamsLine() {
    var chips = DATA.teams.map(function (team) {
      return '<span class="team-chip" style="--team-color:' + escapeHtml(team.color) + '">' +
        escapeHtml(team.name) + "</span>";
    }).join('<span class="vs">×</span>');
    return '<div class="teams-line">' + chips + "</div>";
  }

  function renderSummary(entries, pairs, state) {
    var teamNameById = {};
    entries.forEach(function (entry) { teamNameById[entry.team.id] = entry.team.name; });
    var teamNames = Object.keys(teamNameById).map(function (id) { return teamNameById[id]; });

    var crossTeamPairs = pairs.filter(function (pair) { return pair.isCrossTeam && pair.level; });
    var reachablePairs = crossTeamPairs.filter(function (pair) { return pair.slack >= 0; });

    var level = null;
    if (crossTeamPairs.length > 0) {
      // 最も余裕のある異チーム間の組み合わせを、その日の総合判定とする
      var bestSlack = crossTeamPairs.reduce(function (best, pair) {
        return Math.max(best, pair.slack);
      }, -Infinity);
      level = judge(bestSlack);
    }

    var face = level ? level.icon + level.face : "🤔";
    var headline;
    var detail;
    if (entries.length === 0) {
      face = "🗓️";
      headline = dayLabel(state.selectedDate) + " の演舞はありません";
      detail = "この日の出演がデータに入っていません。上のタブで別の日に切り替えてください。";
    } else if (teamNames.length === 1) {
      face = "🎐";
      headline = "この日は " + teamNames[0] + " だけ";
      detail = "もう一方のチームの出演がないので、はしごの判定はありません。";
    } else if (level === null) {
      headline = "判定できません";
      detail = "2チーム分の演舞を data.js に入れてください。";
    } else if (reachablePairs.length === 0) {
      headline = "続けて見られる並びはなし";
      detail = "2チームが続けて出る組み合わせは、どれも移動が間に合いません。どちらかに絞ることになります。";
    } else {
      headline = "はしごできる並びが " + reachablePairs.length + " 通り";
      detail = "いちばん余裕があるのは、下の一覧で「" + level.label + "」になっている組み合わせです。";
    }

    return '<section class="summary level-' + (level ? level.key : "none") + '">' +
      '<div class="summary-face">' + face + "</div>" +
      '<div class="summary-text">' +
        '<div class="summary-headline">' + escapeHtml(headline) + "</div>" +
        '<div class="summary-detail">' + escapeHtml(detail) + "</div>" +
      "</div>" +
      "</section>";
  }

  function renderCard(entry, state) {
    if (!entry.venue) {
      return '<li class="perf-card card-error">会場ID「' + escapeHtml(entry.venueId) +
        "」が見つかりません（" + toHHMM(entry.startMin) + "）</li>";
    }

    var classNames = ["perf-card"];
    if (state.isLiveDay && entry.endMin <= state.nowMinutes) classNames.push("past");
    if (state.nextEntry === entry) classNames.push("next");

    var timeText = toHHMM(entry.startMin) + " – " + toHHMM(entry.endMin);
    var estimatedBadge = entry.endIsEstimated ? '<span class="badge-estimated">終了は推定</span>' : "";
    var nextBadge = state.nextEntry === entry ? '<span class="badge-next">次はここ</span>' : "";

    return '<li class="' + classNames.join(" ") + '" style="--team-color:' + escapeHtml(entry.team.color) + '">' +
      '<div class="card-head">' +
        '<span class="card-team">' + escapeHtml(entry.team.name) + "</span>" + nextBadge +
      "</div>" +
      '<div class="card-time">' + escapeHtml(timeText) + estimatedBadge + "</div>" +
      '<div class="card-venue">' + escapeHtml(entry.venue.name) + "</div>" +
      '<div class="card-access">' + escapeHtml(entry.venue.access) + "</div>" +
      '<a class="map-button" href="' + escapeHtml(directionsUrl(entry.venue)) +
        '" target="_blank" rel="noopener">🧭 ここへ道案内</a>' +
      "</li>";
  }

  function renderBand(pair) {
    if (!pair.level) return "";

    var classNames = ["gap-band", "level-" + pair.level.key];
    if (pair.isCrossTeam) classNames.push("cross-team");

    var slackText = pair.slack >= 0
      ? "余裕 " + pair.slack + "分"
      : Math.abs(pair.slack) + "分 足りない";
    var walkText = pair.walk === 0 ? "同じ会場" : "徒歩 約" + pair.walk + "分";
    var crossBadge = pair.isCrossTeam ? '<span class="band-cross">2チームはしご</span>' : "";

    // 同じ会場なら移動そのものが無いのでリンクは出さない
    var routeLinks = "";
    if (pair.walk !== null && pair.walk > 0) {
      routeLinks += '<a class="route-link" href="' +
        escapeHtml(routeUrl(pair.from.venue, pair.to.venue, "walking")) +
        '" target="_blank" rel="noopener">🚶 徒歩ルート</a>';
      // 徒歩では遠すぎる区間は、電車のほうが現実的なので実測を見られるようにする
      if (pair.straight !== null && pair.straight >= DATA.transitHintMeters) {
        routeLinks += '<a class="route-link transit" href="' +
          escapeHtml(routeUrl(pair.from.venue, pair.to.venue, "transit")) +
          '" target="_blank" rel="noopener">🚇 電車ルート</a>';
      }
      routeLinks = '<span class="band-routes">' + routeLinks + "</span>";
    }

    return '<li class="' + classNames.join(" ") + '">' +
      '<span class="band-face">' + pair.level.icon + pair.level.face + "</span>" +
      '<span class="band-label">' + escapeHtml(pair.level.label) + "</span>" +
      '<span class="band-detail">' + escapeHtml(slackText) + " ／ " + escapeHtml(walkText) + "</span>" +
      crossBadge +
      routeLinks +
      "</li>";
  }

  function renderProblems() {
    if (problems.length === 0) return "";
    var items = problems.map(function (problem) {
      return "<li>" + escapeHtml(problem) + "</li>";
    }).join("");
    return '<section class="problems"><strong>data.js に問題があります</strong><ul>' + items + "</ul></section>";
  }

  function renderTestBanner(query, overriddenNow) {
    if (overriddenNow === null && !query.today) return "";
    var label = [];
    if (overriddenNow !== null) label.push("時刻 " + toHHMM(overriddenNow));
    if (query.today) label.push("今日の日付 " + query.today);
    return '<section class="test-banner">テスト表示中（' + escapeHtml(label.join(" / ")) +
      "）。本番では URL の ?now= と ?today= を外してください。</section>";
  }

  function render(isInitial) {
    // 再描画のたびに検証結果が積み上がらないよう、毎回リセットする
    problems = [];

    var query = readQuery();
    var jst = jstNowParts();
    var overriddenNow = query.now ? toMinutes(query.now) : null;
    var nowMinutes = overriddenNow === null ? jst.minutes : overriddenNow;
    var todayDate = query.today || jst.date;
    var selectedDate = resolveSelectedDate(query, todayDate);

    var entries = buildEntries(null, selectedDate);
    var pairs = buildPairs(entries);

    var state = {
      nowMinutes: nowMinutes,
      todayDate: todayDate,
      selectedDate: selectedDate,
      // 選んだ日が実際の今日のときだけ、現在時刻での強調を働かせる
      isLiveDay: todayDate === selectedDate,
      nextEntry: null
    };
    if (state.isLiveDay) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].startMin > nowMinutes) {
          state.nextEntry = entries[i];
          break;
        }
      }
    }

    var timeline = "";
    entries.forEach(function (entry, index) {
      timeline += renderCard(entry, state);
      if (index < pairs.length) timeline += renderBand(pairs[index]);
    });

    var note = '<footer class="note">' +
      "掲載されている開始時刻はどれも「◯◯頃」の目安で、終了時刻は公表されていません。" +
      "このページでは1演舞を " + DATA.defaultDurationMin + " 分として計算しています。<br>" +
      "徒歩時間は会場間の直線距離を " + DATA.detourFactor + " 倍し、分速 " + DATA.walkSpeedMPerMin +
      "m で割った概算です。人混み・交通規制・入場待ちは含みません。" +
      "地下鉄を使えば間に合う区間もあるので、判定が渋いところは電車ルートのリンクで実測を見てください。" +
      "</footer>";

    document.getElementById("app").innerHTML =
      renderHeader(state) +
      '<main class="app-main">' +
        renderTestBanner(query, overriddenNow) +
        renderProblems() +
        renderTeamsLine() +
        renderSummary(entries, pairs, state) +
        '<ol class="timeline">' + timeline + "</ol>" +
        note +
      "</main>";

    // 自動スクロールは初回だけ。読んでいる最中に画面が飛ばないようにする。
    // アニメーションさせないのは、開いた直後に画面が流れると酔うため。
    if (isInitial) {
      var nextCard = document.querySelector(".perf-card.next");
      if (nextCard) nextCard.scrollIntoView({ block: "center", behavior: "auto" });
    }
  }

  /**
   * 当日に真っ白な画面が出るのが最悪なので、例外は握って画面に出す。
   * 公式スケジュールへの逃げ道も添える。
   */
  function renderSafely(isInitial) {
    try {
      render(isInitial);
    } catch (error) {
      var message = (error && error.message) ? error.message : String(error);
      document.getElementById("app").innerHTML =
        '<section class="problems"><strong>表示エラー</strong>' +
        "<p>" + escapeHtml(message) + "</p>" +
        '<p><a href="https://www.domatsuri.com/access/schedule.html" target="_blank" rel="noopener">' +
        "公式の会場別演舞スケジュールを開く</a></p></section>";
    }
  }

  /* ---------------------------------------------------------------------
   * tests.html から検証するために、判定に関わる部分だけ公開する。
   * DOM にも現在時刻にも依存しない純粋な関数だけを出す。
   * ------------------------------------------------------------------- */
  window.DomatsuriLogic = {
    toMinutes: toMinutes,
    toHHMM: toHHMM,
    haversineMeters: haversineMeters,
    walkMinutes: walkMinutes,
    routeUrl: routeUrl,
    directionsUrl: directionsUrl,
    judge: judge,
    buildEntries: buildEntries,
    buildPairs: buildPairs,
    resolveSelectedDate: resolveSelectedDate,
    countPerformances: countPerformances,
    dayLabel: dayLabel,
    getProblems: function () { return problems.slice(); },
    resetProblems: function () { problems = []; },
  };

  document.addEventListener("DOMContentLoaded", function () {
    renderSafely(true);

    // 判定の粒度は「分」なので30秒ごとで足りる
    window.setInterval(function () { renderSafely(false); }, 30000);

    // バックグラウンドではタイマーが絞られるので、画面に戻った瞬間に描き直す
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) renderSafely(false);
    });
  });
})();
