"use strict";
(() => {
  const $ = (s) => document.querySelector(s),
    escape = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get("code"),
    displayToken = params.get("token");
  let socket,
    game,
    question,
    result,
    rows = [],
    board = false,
    buzzes = [],
    buzzOpen = false,
    offset = 0,
    retry,
    stopped = false,
    pingAt = 0;
  const symbols = ["▲", "◆", "●", "■", "⬟", "★"];
  // The stage is rebuilt on every message. Only the first render of a question
  // plays the "question, then answers" reveal; later updates must not replay it.
  let revealKey = "";
  function fit() {
    const root = $("#displayStage");
    const hasImage = !!$(".display-question.has-image .display-media img");
    const questionBase = innerWidth >= 1600 ? 60 : 48;
    const answerBase = innerWidth >= 1600 ? 36 : 30;
    root.style.setProperty("--display-question", questionBase + "px");
    root.style.setProperty("--display-answer", answerBase + "px");
    const fits = () => root.scrollHeight <= root.clientHeight + 2;
    if (hasImage) {
      // The picture owns whatever room the question and the answers leave: it
      // is laid out with flexbox, full width, and shrinks only if the text needs
      // the space. The text keeps its readable size; no shrinking loop.
      root.style.setProperty("--display-media", "80vh");
      return;
    }
    for (let i = 0; i <= 20; i++) {
      root.style.setProperty(
        "--display-media",
        Math.max(120, innerHeight * 0.62 - i * 24) + "px",
      );
      if (fits()) return;
    }
    root.style.setProperty("--display-question", "36px");
    root.style.setProperty("--display-answer", "28px");
    // Content stays scrollable instead of clipping at high zoom or extreme length.
  }
  // Columns above the answers, drawn only once the answers are revealed.
  function answerColumns() {
    const options = question?.options || [];
    const stats = result?.stats || {};
    const counts = options.map((_, i) => Number(stats[i]) || 0);
    const votes = counts.reduce((sum, n) => sum + n, 0);
    const tallest = Math.max(1, ...counts);
    return `<div class="display-chart" style="--columns:${options.length}">${counts
      .map(
        (count, i) =>
          `<div class="display-chart-column${result?.correctIndices?.includes(i) ? " is-correct" : ""}"><span class="display-chart-count">${count}</span><span class="display-chart-track"><i class="tile-${i}" style="height:${count ? Math.max(6, Math.round((count / tallest) * 100)) : 0}%"></i></span><span class="display-chart-symbol">${symbols[i]}</span><span class="display-chart-share">${votes ? Math.round((count / votes) * 100) : 0}%</span></div>`,
      )
      .join("")}</div>`;
  }
  // The last screen of the night: the top three on pedestals, their own
  // characters standing on top, and a plain list for everyone below them.
  function podium(rows) {
    const place = (p) => {
      if (!p) return "";
      const rank = Number(p.rank) || 0;
      // A player's own face is composited on their phone and lives in this
      // room, so it arrives as one small image rather than a drawing.
      const self =
        typeof p.character === "string" && p.character.startsWith("self:");
      const crown =
        rank === 1
          ? '<span class="display-podium-crown" aria-hidden="true"><svg viewBox="0 0 48 32" width="40" height="26"><path d="M4 30 2 8l12 8 10-14 10 14 12-8-2 22z" fill="#f6c542" stroke="#b8860b" stroke-width="2" stroke-linejoin="round"/></svg></span>'
          : "";
      const mood = rank === 1 ? " react-win" : rank ? " react-clap" : "";
      const figure = self
        ? `<span class="display-podium-figure${mood}">${crown}<img class="kchar kchar-self" src="/live-avatar/${encodeURIComponent(game?.code || "")}/${encodeURIComponent(String(p.character).slice(5))}.webp?r=${Number(p.faceRev) || 0}" alt="" /></span>`
        : window.QuizzesCharacters && p.character
          ? `<span class="display-podium-figure${mood}">${crown}${window.QuizzesCharacters.render(p.character, p.accessory)}</span>`
          : "";
      return `<div class="display-podium-place place-${rank}">${figure}<div class="display-podium-block"><span class="display-podium-badge">${rank}</span><b>${escape(p.name)}</b><span class="display-podium-score">${Number(p.score).toLocaleString()} <small>pts</small></span></div></div>`;
    };
    const top = rows.slice(0, 3);
    const rest = rows.slice(3);
    // One or two players: only the places that exist, centred on the wall.
    const places =
      top.length === 1
        ? place(top[0])
        : top.length === 2
          ? `${place(top[1])}${place(top[0])}`
          : `${place(top[1])}${place(top[0])}${place(top[2])}`;
    return `<div class="display-podium${top.length < 3 ? " is-few" : ""}" data-count="${top.length}" aria-label="Final podium">${places}</div>${
      rest.length
        ? `<ol class="display-podium-rest">${rest.map((p) => `<li><b>${Number(p.rank)}</b><span>${escape(p.name)}</span><strong>${Number(p.score).toLocaleString()} <small>pts</small></strong></li>`).join("")}</ol>`
        : ""
    }`;
  }
  function ranking() {
    if (game.status === "ended")
      return `<div class="display-standings display-final"><div class="eyebrow">FINAL RESULTS</div><h1 class="final-results-title">The Winners</h1>${
        rows.length ? podium(rows) : "<p>No participants yet.</p>"
      }</div>`;
    return `<div class="display-standings"><div class="eyebrow">LIVE STANDINGS</div><h1>Leaderboard</h1>${rows.length ? `<ol>${rows.map((p) => `<li><b>${Number(p.rank)}</b><span>${escape(p.name)}</span><strong>${Number(p.score).toLocaleString()} <small>pts</small></strong></li>`).join("")}</ol>` : "<p>No participants yet.</p>"}</div>`;
  }
  let cheered = false;
  function render() {
    if (!game) return;
    // The wall celebrates the podium once, when it first appears.
    if (game.status === "ended") {
      if (!cheered) {
        cheered = true;
        setTimeout(() => {
          if (game?.status === "ended")
            window.QuizzesCelebrate?.from($(".display-podium"), 180);
        }, 800);
      }
    } else cheered = false;
    // Each round carries its own accent on the wall too.
    if (question)
      document.body.dataset.tone = String(((Number(question.roundIndex) || 0) % 3) + 1);
    $("#displayTitle").textContent = game.title;
    $("#displayCode").textContent = "Join · " + game.code;
    $("#displayCount").textContent =
      game.status === "question" || game.status === "buzzer"
        ? `${game.participants.length} joined`
        : `${game.participants.length} joined · ${game.participants.filter((p) => p.answered).length} answered`;
    const stage = $("#displayStage");
    // At the reveal the room reads three things in order: the question, then the
    // bars, then which answer was right. All three stay on screen.
    const revealing =
      game.status === "results" && question && question.type !== "text" && !board;
    document.body.classList.toggle("is-reveal", !!revealing);
    if (game.status === "ended" || board) stage.innerHTML = ranking();
    else if (["round_intro", "last_question_intro"].includes(game.status)) {
      const last = game.status === "last_question_intro";
      stage.innerHTML = `<section class="projector-lobby round-announcement"><div class="eyebrow">${last ? "ROUND FINALE" : "NEXT ROUND"}</div><h1>${last ? "Last question of " : ""}${escape(game.upcomingRound)}</h1><p>${last ? "Make this one count!" : "A fresh round. A new chance to climb."}</p><p class="muted">The host will start the question. No timer is running yet.</p></section>`;
    } else if (game.status === "lobby") {
      const join = new URL("/join", location.origin);
      join.searchParams.set("code", game.code);
      // Left: how to join, with the code and the QR. Middle: the quiz waiting to
      // start. Right: who is already in the room, by nickname.
      const seated = game.participants;
      stage.innerHTML = `<section class="projector-lobby projector-room">
        <div class="projector-join"><small>JOIN</small><div id="displayQR" class="join-qr"></div><span class="projector-join-label">GAME CODE</span><strong>${escape(game.code)}</strong><p>${escape(join.origin.replace(/^https?:\/\//, ""))}/join</p></div>
        <div class="projector-room-centre"><div class="eyebrow">READY WHEN YOU ARE</div><h1>${escape(game.title)}</h1><p class="projector-room-count"><b>${seated.length}</b> ${seated.length === 1 ? "player" : "players"} in the room</p></div>
        <div class="projector-people"><div class="eyebrow">PARTICIPANTS <b>${seated.length}</b></div>${
          seated.length
            ? `<ul>${seated
                .map((p) => {
                  const self =
                    typeof p.character === "string" &&
                    p.character.startsWith("self:");
                  const figure = self
                    ? `<img class="kchar kchar-self" src="/live-avatar/${encodeURIComponent(game.code)}/${encodeURIComponent(String(p.character).slice(5))}.webp?r=${Number(p.faceRev) || 0}" alt="" />`
                    : window.QuizzesCharacters
                      ? window.QuizzesCharacters.render(p.character, p.accessory, {
                          label: false,
                          thumb: true,
                        })
                      : "";
                  return `<li class="${p.connected ? "" : "is-away"}"><span class="projector-figure">${figure}</span><span>${escape(p.name)}</span></li>`;
                })
                .join("")}</ul>`
            : '<p class="muted">Waiting for the first player.</p>'
        }</div>
      </section>`;
      const qr = qrcode(0, "M");
      qr.addData(join.href);
      qr.make();
      $("#displayQR").innerHTML = qr.createSvgTag({
        scalable: true,
        margin: 4,
      });
    } else if (game.status === "buzzer" && question) {
      const queue = buzzes || [];
      stage.innerHTML = `<section class="display-question display-buzzer"><div class="display-meta"><span>${escape(question.roundLabel)}</span><span>QUESTION ${question.index + 1} / ${question.total}</span><b id="displayTimer" role="timer">${buzzOpen ? "BUZZ OPEN" : "BUZZ CLOSED"}</b></div><h1>${escape(question.text)}</h1><div class="display-buzzes">${queue.length ? `<ol>${queue.map((b) => `<li class="buzz-row buzz-${escape(b.status)}"><b class="buzz-pos">${b.position}</b><span class="buzz-name">${escape(b.name)}</span><span class="buzz-time">${(b.elapsedMs / 1000).toFixed(1)}s</span>${b.points ? `<span class="buzz-points">${b.points > 0 ? "+" : "−"}${Math.abs(b.points).toLocaleString()}</span>` : ""}</li>`).join("")}</ol>` : '<p class="muted">No one has buzzed in yet.</p>'}</div></section>`;
      tick();
    } else if (question) {
      // Two steps on the projector too: the question lands alone, then the
      // host presses again and the answers follow it in.
      const optionsReady = question.optionsVisible !== false;
      const key = `${game.status}:${question.index}:${question.id}:${optionsReady}`;
      const fresh = key !== revealKey;
      revealKey = key;
      const revealed = game.status === "results";
      // No instructions on the wall: the question, its picture across the full
      // width, then the answers. The room knows what to do with a phone.
      const image = !revealed && question.media && question.mediaType?.startsWith("image/");
      const audio = !revealed && question.media && !image;
      stage.innerHTML = `<section class="display-question${image ? " has-image" : ""}${!image && !audio && ["choice", "multi", "boolean"].includes(question.type) ? " showcase-question" : ""}"><div class="display-meta"><span>${escape(question.roundLabel)}</span><span>QUESTION ${question.index + 1} / ${question.total}</span><b id="displayTimer" role="timer"></b></div><h1>${escape(question.text)}</h1>${
        image
          ? `<div class="display-media"><img loading="eager" fetchpriority="high" decoding="async" src="${escape(question.media)}" alt="Question image"></div>`
          : audio
            ? `<div class="display-media is-audio" aria-hidden="true"></div>`
            : ""
      }<div class="display-options${fresh ? " reveal-answers" : ""}" style="--reveal-delay:${fresh ? "0.25s" : "0s"}">${(optionsReady ? question.options || [] : []).map((o, i) => {
        const right = revealed && result?.correctIndices?.includes(i);
        const mark = revealed ? `<span class="display-mark" aria-hidden="true">${right ? "✓" : "✗"}</span>` : "";
        const stats = result?.stats || {};
        const total = Object.values(stats).reduce((sum, n) => sum + (Number(n) || 0), 0);
        const count = Number(stats[i]) || 0;
        const pct = total ? Math.round(count / total * 100) : 0;
        const badge = revealed ? `<span class="vote-badge">${count} vote${count === 1 ? "" : "s"} · ${pct}%</span>` : "";
        return `<div class="display-option tile-${i} ${right ? "display-correct" : revealed ? "display-wrong" : ""}" style="--i:${i}"><span aria-hidden="true">${symbols[i]}</span><span class="display-option-copy">${escape(o)}</span>${mark}${badge}</div>`;
      }).join("")}</div>${
        revealed && result?.correct
          ? `<p class="display-answer-line"><span aria-hidden="true">✓</span> ${escape(result.correct)}</p>`
          : ""
      }</section>`;
      $(".display-media img")?.addEventListener("load", fit, { once: true });
      if ($(".display-media img")?.complete) fit();
      tick();
    }
    requestAnimationFrame(fit);
    if ($(".display-media img") && !$(".display-media img").complete)
      setTimeout(fit, 400);
  }
  function tick() {
    const el = $("#displayTimer");
    if (el && game)
      el.textContent =
        game.status === "buzzer"
          ? (buzzOpen ? "BUZZ OPEN" : "BUZZ CLOSED")
          : game.status === "question"
          ? game.deadline
            ? Math.max(
                0,
                Math.ceil((game.deadline - Date.now() - offset) / 1000),
              ) + "s"
            : "READY"
          : "RESULTS";
  }
  function connect() {
    if (stopped) return;
    socket = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`,
    );
    socket.onopen = () => {
      pingAt = Date.now();
      socket.send(JSON.stringify({ type: "ping" }));
      socket.send(JSON.stringify({ type: "join_display", code, displayToken }));
    };
    socket.onmessage = (event) => {
      const m = JSON.parse(event.data);
      if (m.type === "clock") {
        offset = m.serverNow - (Date.now() + pingAt) / 2;
        return;
      }
      if (m.type === "error") {
        stopped = true;
        $("#displayStage").textContent = m.message;
        socket.close();
        return;
      }
      if (m.type === "host_offline") {
        $("#displayConnection").textContent =
          "Host disconnected · waiting for reconnection";
        return;
      }
      if (m.type === "host_online") {
        $("#displayConnection").textContent = "Host connected";
        return;
      }
      if (m.type === "display_joined") {
        game = m.game;
        question = m.question;
        result = m.result;
        rows = m.leaderboard || m.visibleLeaderboard || [];
        board = game.leaderboardVisible;
        buzzes = m.buzzes || [];
        buzzOpen = m.open !== false;
        if (m.serverNow) offset = m.serverNow - Date.now();
        $("#displayConnection").textContent = "Connected · audience display";
        render();
        return;
      }
      if (m.type === "leaderboard_control") {
        board = m.visible;
        rows = m.leaderboard || [];
        render();
        return;
      }
      if (m.game) game = m.game;
      if (m.type === "buzzer_started") {
        question = m.question;
        result = null;
        board = false;
        buzzes = m.buzzes || [];
        buzzOpen = m.open !== false;
        render();
      } else if (m.type === "buzz_queue") {
        buzzes = m.buzzes || [];
        buzzOpen = m.open !== false;
        render();
      } else if (m.type === "question_started" || m.type === "options_shown") {
        // Step one is the question alone; step two adds the answers.
        question = m.question;
        result = null;
        board = false;
        buzzes = [];
        render();
      } else if (m.type === "question_ended") {
        result = m;
        rows = m.leaderboard || [];
        board = m.leaderboardVisible;
        render();
      } else if (m.type === "game_ended") {
        board = true;
        rows = m.leaderboard || [];
        render();
      } else if (["round_intro", "last_question_intro"].includes(m.type)) {
        board = false;
        question = null;
        render();
      } else if (m.type === "participants_updated") {
        $("#displayCount").textContent =
          game.status === "question" || game.status === "buzzer"
        ? `${game.participants.length} joined`
        : `${game.participants.length} joined · ${game.participants.filter((p) => p.answered).length} answered`;
        if (board) {
          rows = [...game.participants]
            .sort((a, b) => b.score - a.score)
            .map((p, i) => ({ ...p, rank: i + 1 }));
          render();
        }
      }
    };
    socket.onclose = () => {
      if (stopped) return;
      $("#displayConnection").textContent =
        "Disconnected · reconnecting. The display may be out of date.";
      clearTimeout(retry);
      retry = setTimeout(connect, 2000);
    };
  }
  $("#displayFullscreen").onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      $("#displayConnection").textContent =
        "Use your browser's fullscreen command.";
    }
  };
  window.addEventListener("resize", fit);
  document.fonts?.ready.then(fit);
  setInterval(tick, 150);
  if (
    !/^QZ[A-F0-9]{6}$/.test(code || "") ||
    !/^[a-f0-9]{64}$/.test(displayToken || "")
  )
    $("#displayStage").textContent =
      "Open Projector from the signed-in host's live room.";
  else connect();
})();
