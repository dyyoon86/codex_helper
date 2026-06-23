const canvas = document.querySelector("#bannerCanvas");
const ctx = canvas.getContext("2d");

const state = {
  category: "BEST ACTOR",
  title: "한지민",
  subtitle: "영화 <밤의 계단>",
  event: "2026 KOREA FILM AWARDS",
  preset: "cinema",
  size: "1920x1080",
  layout: "lower",
  fit: "cover",
  accent: "#d8b45f",
  bg: "#111111",
  brightness: 78,
  band: 34,
  laurel: true,
  shine: true,
  image: null,
};

const presets = {
  cinema: { accent: "#d8b45f", bg: "#111111" },
  noir: { accent: "#d7dde6", bg: "#0b0d10" },
  festival: { accent: "#e44842", bg: "#140a0c" },
  broadcast: { accent: "#55c7ff", bg: "#07111f" },
};

const controls = {
  category: document.querySelector("#categoryInput"),
  title: document.querySelector("#titleInput"),
  subtitle: document.querySelector("#subtitleInput"),
  event: document.querySelector("#eventInput"),
  preset: document.querySelector("#presetSelect"),
  size: document.querySelector("#sizeSelect"),
  accent: document.querySelector("#accentInput"),
  bg: document.querySelector("#bgInput"),
  brightness: document.querySelector("#brightnessInput"),
  band: document.querySelector("#bandInput"),
  laurel: document.querySelector("#laurelInput"),
  shine: document.querySelector("#shineInput"),
  image: document.querySelector("#imageInput"),
};

function setCanvasSize() {
  const [width, height] = state.size.split("x").map(Number);
  canvas.width = width;
  canvas.height = height;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function fitImage(img, x, y, w, h, mode) {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let dw = w;
  let dh = h;

  if ((mode === "cover" && imgRatio > boxRatio) || (mode === "contain" && imgRatio < boxRatio)) {
    dh = h;
    dw = h * imgRatio;
  } else {
    dw = w;
    dh = w / imgRatio;
  }

  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawFallbackPortrait(x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, rgba(state.accent, 0.55));
  grad.addColorStop(0.5, "#303642");
  grad.addColorStop(1, state.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  ctx.save();
  ctx.translate(x + w * 0.52, y + h * 0.56);
  ctx.fillStyle = "rgb(255 255 255 / 0.12)";
  ctx.beginPath();
  ctx.arc(0, -h * 0.18, Math.min(w, h) * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, h * 0.14, w * 0.19, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawImageLayer() {
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (state.image) {
    fitImage(state.image, 0, 0, canvas.width, canvas.height, state.fit);
  } else {
    drawFallbackPortrait(0, 0, canvas.width, canvas.height);
  }

  ctx.fillStyle = `rgb(0 0 0 / ${(100 - state.brightness) / 110})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const vignette = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.4,
    canvas.width * 0.1,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.72,
  );
  vignette.addColorStop(0, "rgb(0 0 0 / 0)");
  vignette.addColorStop(1, "rgb(0 0 0 / 0.62)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawShine() {
  if (!state.shine) return;

  const glow = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  glow.addColorStop(0, "rgb(255 255 255 / 0)");
  glow.addColorStop(0.52, rgba(state.accent, 0.2));
  glow.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.moveTo(canvas.width * 0.58, 0);
  ctx.lineTo(canvas.width * 0.8, 0);
  ctx.lineTo(canvas.width * 0.43, canvas.height);
  ctx.lineTo(canvas.width * 0.24, canvas.height);
  ctx.closePath();
  ctx.fill();
}

function drawLaurel(cx, cy, scale) {
  if (!state.laurel) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = rgba(state.accent, 0.72);
  ctx.fillStyle = rgba(state.accent, 0.72);
  ctx.lineWidth = scale * 0.03;

  [-1, 1].forEach((side) => {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.arc(scale * 0.25, 0, scale * 0.58, Math.PI * 0.72, Math.PI * 1.24);
    ctx.stroke();

    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI * (0.78 + i * 0.065);
      const x = scale * 0.25 + Math.cos(angle) * scale * 0.58;
      const y = Math.sin(angle) * scale * 0.58;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle - Math.PI * 0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, scale * 0.035, scale * 0.095, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  });
  ctx.restore();
}

function drawTextBlock(x, y, w, align = "left", maxTitle = 96) {
  const base = Math.min(canvas.width, canvas.height);
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = state.accent;
  ctx.font = `800 ${Math.max(22, base * 0.034)}px Arial, sans-serif`;
  ctx.fillText(state.category.toUpperCase(), x, y, w);

  ctx.fillStyle = "#fff8e8";
  ctx.font = `900 ${Math.max(46, Math.min(maxTitle, base * 0.105))}px Arial, sans-serif`;
  ctx.fillText(state.title, x, y + base * 0.095, w);

  ctx.fillStyle = "rgb(255 255 255 / 0.82)";
  ctx.font = `700 ${Math.max(24, base * 0.04)}px Arial, sans-serif`;
  ctx.fillText(state.subtitle, x, y + base * 0.155, w);

  ctx.fillStyle = "rgb(255 255 255 / 0.58)";
  ctx.font = `700 ${Math.max(18, base * 0.027)}px Arial, sans-serif`;
  ctx.fillText(state.event.toUpperCase(), x, y + base * 0.215, w);
}

function drawLowerThird() {
  const h = canvas.height * (state.band / 100);
  const y = canvas.height - h;
  const grad = ctx.createLinearGradient(0, y, canvas.width, canvas.height);
  grad.addColorStop(0, rgba(state.bg, 0.94));
  grad.addColorStop(0.48, rgba(state.bg, 0.82));
  grad.addColorStop(1, rgba(state.accent, 0.28));
  ctx.fillStyle = grad;
  ctx.fillRect(0, y, canvas.width, h);

  ctx.fillStyle = state.accent;
  ctx.fillRect(0, y, canvas.width, Math.max(5, canvas.height * 0.006));

  drawLaurel(canvas.width * 0.16, y + h * 0.52, h * 0.48);
  drawTextBlock(canvas.width * 0.25, y + h * 0.26, canvas.width * 0.62);
}

function drawLeftBanner() {
  const w = canvas.width * 0.42;
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, rgba(state.bg, 0.95));
  grad.addColorStop(0.72, rgba(state.bg, 0.78));
  grad.addColorStop(1, rgba(state.bg, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, canvas.height);
  ctx.fillStyle = state.accent;
  ctx.fillRect(w * 0.08, canvas.height * 0.12, Math.max(6, canvas.width * 0.006), canvas.height * 0.76);
  drawLaurel(w * 0.52, canvas.height * 0.28, canvas.height * 0.15);
  drawTextBlock(w * 0.17, canvas.height * 0.43, w * 0.72, "left", canvas.height * 0.11);
}

function drawSplitBanner() {
  const divider = canvas.width * 0.52;
  const grad = ctx.createLinearGradient(divider, 0, canvas.width, 0);
  grad.addColorStop(0, rgba(state.bg, 0.12));
  grad.addColorStop(0.18, rgba(state.bg, 0.74));
  grad.addColorStop(1, rgba(state.bg, 0.95));
  ctx.fillStyle = grad;
  ctx.fillRect(divider, 0, canvas.width - divider, canvas.height);

  ctx.strokeStyle = rgba(state.accent, 0.85);
  ctx.lineWidth = Math.max(6, canvas.width * 0.006);
  ctx.beginPath();
  ctx.moveTo(divider, canvas.height * 0.13);
  ctx.lineTo(divider, canvas.height * 0.87);
  ctx.stroke();

  drawLaurel(canvas.width * 0.76, canvas.height * 0.28, canvas.height * 0.14);
  drawTextBlock(canvas.width * 0.61, canvas.height * 0.43, canvas.width * 0.34, "left", canvas.height * 0.105);
}

function drawFrame() {
  const inset = Math.max(18, canvas.width * 0.018);
  ctx.strokeStyle = rgba(state.accent, 0.72);
  ctx.lineWidth = Math.max(4, canvas.width * 0.004);
  ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
}

function render() {
  setCanvasSize();
  drawImageLayer();
  drawShine();

  if (state.layout === "left") drawLeftBanner();
  if (state.layout === "split") drawSplitBanner();
  if (state.layout === "lower") drawLowerThird();

  drawFrame();
}

function syncCssAccent() {
  document.documentElement.style.setProperty("--accent", state.accent);
}

Object.entries({
  category: "category",
  title: "title",
  subtitle: "subtitle",
  event: "event",
  size: "size",
  accent: "accent",
  bg: "bg",
  brightness: "brightness",
  band: "band",
}).forEach(([key, controlKey]) => {
  controls[controlKey].addEventListener("input", (event) => {
    state[key] = event.target.value;
    if (key === "accent") syncCssAccent();
    render();
  });
});

controls.preset.addEventListener("change", (event) => {
  state.preset = event.target.value;
  state.accent = presets[state.preset].accent;
  state.bg = presets[state.preset].bg;
  controls.accent.value = state.accent;
  controls.bg.value = state.bg;
  syncCssAccent();
  render();
});

controls.laurel.addEventListener("change", (event) => {
  state.laurel = event.target.checked;
  render();
});

controls.shine.addEventListener("change", (event) => {
  state.shine = event.target.checked;
  render();
});

controls.image.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const img = new Image();
    img.addEventListener("load", () => {
      state.image = img;
      render();
    });
    img.src = reader.result;
  });
  reader.readAsDataURL(file);
});

document.querySelectorAll("[data-fit]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-fit]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    state.fit = button.dataset.fit;
    render();
  });
});

document.querySelectorAll("[data-layout]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-layout]").forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    state.layout = button.dataset.layout;
    render();
  });
});

document.querySelector("#downloadBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `award-banner-${state.size}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

syncCssAccent();
render();
