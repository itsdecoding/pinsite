import { PreviewSiteData } from "./types";
import { resolveTheme } from "./themes";
import { resolveFontConfig } from "./fonts";
import { resolveNicheImages } from "./images";

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderPreviewHtml(data: PreviewSiteData): string {
  const theme = resolveTheme(data.themeId, data.customTheme);
  const font = resolveFontConfig(data.fontPairingId);
  const nicheImages = resolveNicheImages(data.niche);

  const heroImg = data.hero.heroImageUrl || nicheImages.hero;
  const tiltL = data.philosophy.tiltImageLeft || nicheImages.tilts[0];
  const tiltR = data.philosophy.tiltImageRight || nicheImages.tilts[1];
  const founderImg = data.founder.imageUrl || nicheImages.founder;

  const phoneRaw = data.phone.replace(/[^0-9+]/g, "");
  const waRaw = (data.whatsappNumber || data.phone).replace(/[^0-9]/g, "");

  const agencyBarEnabled = data.agencyBar?.enabled !== false;
  const claimUrl =
    data.agencyBar?.claimUrl ||
    `https://wa.me/918080630000?text=${encodeURIComponent(
      `Hi Pinsite, I reviewed the preview for ${data.businessName} and want to launch it.`
    )}`;

  // Render services
  const servicesHtml = (data.servicesSection.items || [])
    .slice(0, 9)
    .map((s, idx) => {
      const sImg = s.imageUrl || nicheImages.services[idx % nicheImages.services.length];
      return `
      <article class="t">
        <img class="t-img" src="${escapeHtml(sImg)}" alt="${escapeHtml(s.title)}" width="900" height="675" loading="lazy" decoding="async">
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.description)}</p>
      </article>`;
    })
    .join("");

  // Render 4 pillars
  const pillarsHtml = (data.principles.pillars || [])
    .slice(0, 4)
    .map((p) => {
      return `
      <article class="card reveal">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="16" cy="17" r="11"/><path d="M16 10v7l4 3M12 3h8"/></svg>
        <h3>${escapeHtml(p.title)}</h3>
        <p>${escapeHtml(p.description)}</p>
      </article>`;
    })
    .join("");

  // Render 5 steps
  const stepsHtml = (data.process.steps || [])
    .slice(0, 5)
    .map((st, i) => {
      const isFirst = i === 0 ? " first" : "";
      return `
      <li class="step${isFirst} reveal">
        <span class="n">${st.stepNumber || i + 1}</span>
        <h3>${escapeHtml(st.title)}</h3>
        <p>${escapeHtml(st.description)}</p>
      </li>`;
    })
    .join("");

  // Render 3 reviews
  const reviewsHtml = (data.reviews.items || [])
    .slice(0, 3)
    .map((r) => {
      const initials =
        r.initials ||
        r.author
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2) ||
        "CL";
      return `
      <article class="rev reveal">
        <q>${escapeHtml(r.quote)}</q>
        <div class="who">
          <div class="av">${escapeHtml(initials)}</div>
          <div>
            <span style="display:inline;color:inherit;font-size:inherit;font-weight:600">${escapeHtml(r.author)}</span>
            <span style="display:block;color:var(--ink-3);font-size:13.5px">${escapeHtml(r.roleOrLocation || "Verified Customer")}</span>
          </div>
        </div>
      </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.businessName)} | ${escapeHtml(data.city)}</title>
<meta name="description" content="${escapeHtml(data.hero.subheadline)}">
<meta name="robots" content="noindex, nofollow, noarchive">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${escapeHtml(font.googleFontsUrl)}" rel="stylesheet">
<style>
:root{
  --ink:${theme.ink}; --ink-2:${theme.ink2}; --ink-3:${theme.ink3};
  --paper:${theme.paper}; --mist:${theme.mist}; --line:${theme.line};
  --mint:${theme.mint}; --mint-2:${theme.mint2}; --teal:${theme.teal}; --forest:${theme.forest}; --forest-2:${theme.forest2};
  --red:${theme.accent};
  --r-sheet:28px; --r-card:20px;
  --sans:${font.sansFamily};
  --serif:${font.serifFamily};
  --pad:clamp(16px,4vw,40px);
}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;scroll-padding-top:100px}
body{margin:0;background:var(--paper);color:var(--ink);font:400 17px/1.6 var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a{color:inherit;text-decoration:none}
button{font:inherit;color:inherit;cursor:pointer}
em{font-family:var(--serif);font-style:italic;font-weight:500;letter-spacing:-.01em}
:focus-visible{outline:2px solid var(--teal);outline-offset:3px;border-radius:8px}
.wrap{max-width:1280px;margin:0 auto;padding:0 var(--pad)}

/* ---------- agency wrapper bar (pinsite) ---------- */
.pinsite-bar{position:fixed;top:0;left:0;right:0;z-index:90;background:rgba(15,23,42,.94);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-bottom:1px solid rgba(255,255,255,.1);color:#fff;padding:8px var(--pad);display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13.5px}
.pinsite-bar-left{display:flex;align-items:center;gap:10px;min-width:0}
.pinsite-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(34,197,94,.18);color:#4ADE80;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}
.pinsite-pill::before{content:"";width:6px;height:6px;border-radius:50%;background:#4ADE80;box-shadow:0 0 8px #4ADE80}
.pinsite-bar-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(255,255,255,.85)}
.pinsite-bar-txt b{color:#fff}
.pinsite-claim{display:inline-flex;align-items:center;gap:6px;background:#F95721;color:#fff;font-weight:600;font-size:13px;padding:6px 14px;border-radius:999px;transition:transform .2s,background .2s;white-space:nowrap}
.pinsite-claim:hover{background:#ea4610;transform:translateY(-1px)}

/* ---------- shared pieces ---------- */
.btn{display:inline-flex;align-items:center;gap:12px;padding:6px 20px 6px 6px;border-radius:999px;font-weight:600;font-size:16px;border:0;transition:transform .25s ease,background .25s ease}
.btn .dot{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex:none;transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.btn:hover .dot{transform:rotate(-45deg)}
.btn:active{transform:scale(.98)}
.btn-mint{background:var(--mint);color:var(--forest)}
.btn-mint .dot{background:var(--forest);color:var(--mint)}
.btn-ink{background:var(--ink);color:#fff}
.btn-ink .dot{background:var(--mint);color:var(--forest)}
.btn-ghost{background:transparent;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.3);padding:6px 20px 6px 6px}
.btn-ghost .dot{background:rgba(255,255,255,.12)}
.btn-line{background:var(--paper);box-shadow:inset 0 0 0 1px var(--line);color:var(--ink)}
.btn-line .dot{background:var(--mist)}
h1,h2,h3{margin:0;font-weight:500;letter-spacing:-.03em;line-height:1.02}
h2{font-size:clamp(34px,4.6vw,60px);text-wrap:balance}
h2 em{font-weight:400}
.lede{color:var(--ink-2);max-width:46ch;font-size:clamp(17px,1.3vw,19px);text-wrap:pretty}
.hero-sub{text-wrap:pretty}
html .reveal{opacity:0;transform:translateY(22px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}
html .reveal.in{opacity:1;transform:none}

/* ---------- nav ---------- */
.nav{position:fixed;inset:52px 0 auto;z-index:50;pointer-events:none;transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.nav.hide{transform:translateY(calc(-100% - 20px))}
.nav-in{pointer-events:auto;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;padding:8px 8px 8px 16px;border-radius:999px;border:1px solid transparent;transition:background .4s ease,box-shadow .4s ease,border-color .4s ease}
.nav.glass .nav-in{background:rgba(15,23,42,.65);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-color:rgba(255,255,255,.08);box-shadow:0 14px 36px -22px rgba(0,0,0,.6)}
.nav.solid .nav-in{background:rgba(255,255,255,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-color:var(--line);box-shadow:0 14px 36px -22px rgba(0,0,0,.25)}
.brand{display:flex;align-items:center;gap:10px;color:#fff;transition:color .4s;justify-self:start;min-width:0}
.nav.solid .brand{color:var(--ink)}
.brand b{display:block;font-size:17px;font-weight:700;letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
.brand small{display:block;font-size:13.5px;opacity:.8;letter-spacing:.01em;white-space:nowrap}
.links{position:relative;display:flex;gap:2px;padding:4px;border-radius:999px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:background .4s,border-color .4s}
.nav.solid .links{background:var(--mist);border-color:transparent}
.links a{position:relative;z-index:1;padding:9px 17px;border-radius:999px;font-size:14.5px;font-weight:500;color:rgba(255,255,255,.8);transition:color .3s;white-space:nowrap}
.links a:hover{color:#fff}
.nav.solid .links a{color:var(--ink-2)}
.nav.solid .links a:hover{color:var(--ink)}
.nav-act{display:flex;align-items:center;gap:8px;justify-self:end}
.nav .book{padding:5px 18px 5px 5px;font-size:15px;white-space:nowrap}
.nav .book .dot{width:34px;height:34px}
.nav.solid .book{background:var(--ink);color:#fff}
.nav.solid .book .dot{background:var(--mint);color:var(--forest)}
.menu-btn{display:none;width:44px;height:44px;flex:none;border-radius:50%;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);color:#fff;place-items:center}
.menu-btn span,.menu-btn span::after{display:block;width:18px;height:2px;border-radius:2px;background:currentColor}
.menu-btn span{position:relative;top:-3px}
.menu-btn span::after{content:"";position:absolute;left:0;top:6px;width:12px}

/* ---------- phone menu drawer ---------- */
.menu{position:fixed;inset:10px;z-index:100;border-radius:var(--r-sheet);background:var(--forest);color:#fff;padding:18px 20px 24px;display:flex;flex-direction:column;opacity:0;visibility:hidden;transform:translateY(-14px) scale(.985);transition:opacity .3s,transform .45s cubic-bezier(.2,.8,.2,1),visibility 0s .45s;overflow:auto}
.menu.open{opacity:1;visibility:visible;transform:none}
.menu-top{display:flex;justify-content:space-between;align-items:center}
.menu-x{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.08);display:grid;place-items:center;color:#fff}
.menu nav{margin:auto 0;padding:24px 0;display:flex;flex-direction:column}
.menu nav a{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.12);font-size:clamp(26px,7vw,36px);font-weight:500}

/* ---------- hero ---------- */
.hero{padding:54px 10px 10px}
.hero-sheet{position:relative;border-radius:var(--r-sheet);background:var(--forest);color:#fff;overflow:hidden;min-height:min(860px,100svh);display:grid;grid-template-columns:minmax(0,1fr);align-items:center;padding:clamp(112px,13vh,150px) max(clamp(20px,4.5vw,64px),calc(50% - 640px + var(--pad))) clamp(40px,5vw,64px)}
.hero-sheet::before{content:"";position:absolute;inset:0;background:radial-gradient(60% 70% at 85% 30%,rgba(255,255,255,.1),transparent 70%),radial-gradient(50% 60% at 0% 100%,rgba(0,0,0,.45),transparent 70%);pointer-events:none}
.hero-copy{position:relative;z-index:2;display:flex;flex-direction:column;justify-content:center;gap:36px;min-width:0}
.hero h1{font-size:clamp(52px,9.2vw,140px);line-height:.94;letter-spacing:-.045em;margin-top:0}
.hero h1 em{font-weight:400;color:var(--mint-2);letter-spacing:-.02em}
.hero h1 .ln{display:block;overflow:hidden;padding-bottom:.06em}
.hero h1 .ln>span{display:inline-block;transform:translateY(105%);transition:transform 1.1s cubic-bezier(.2,.8,.15,1)}
.loaded .hero h1 .ln>span{transform:none}
.loaded .hero h1 .ln:nth-child(2)>span{transition-delay:.09s}
.loaded .hero h1 .ln:nth-child(3)>span{transition-delay:.18s}
.hero-sub{max-width:44ch;color:rgba(255,255,255,.82);font-size:clamp(17px,1.4vw,20px);margin:24px 0 28px}
.cta-row{display:flex;flex-wrap:wrap;gap:12px}
.hero-bg{position:absolute;top:0;right:0;bottom:0;width:65%;background:url("${escapeHtml(heroImg)}") 50% 34%/cover no-repeat;opacity:.48;-webkit-mask-image:linear-gradient(90deg,transparent 0,rgba(0,0,0,.5) 28%,#000 62%);mask-image:linear-gradient(90deg,transparent 0,rgba(0,0,0,.5) 28%,#000 62%);transform:scale(1.05);transition:transform 2.6s cubic-bezier(.2,.7,.2,1)}
.loaded .hero-bg{transform:scale(1)}
.hero-bg::after{content:"";position:absolute;inset:0;background:linear-gradient(0deg,var(--forest) 0,transparent 38%),linear-gradient(180deg,rgba(0,0,0,.5) 0,transparent 30%)}

/* ---------- about / philosophy ---------- */
.about{padding:clamp(80px,10vw,140px) 0 clamp(60px,8vw,100px);text-align:center;position:relative}
.about .statement{font-size:clamp(24px,2.8vw,40px);line-height:1.24;letter-spacing:-.025em;font-weight:400;max-width:760px;margin:24px auto 32px;color:#64748B;text-wrap:balance}
.about .statement b{font-weight:600;color:var(--ink)}
.about .statement em{color:var(--ink);font-weight:500}
.tilts{display:contents}
.tilt{position:absolute;margin:0;width:clamp(110px,11vw,170px);aspect-ratio:4/5;border-radius:18px;overflow:hidden;box-shadow:0 26px 50px -26px rgba(0,0,0,.35)}
.tilt img{width:100%;height:100%;object-fit:cover}
.tilt.l{left:max(var(--pad),calc(50% - 640px + var(--pad)));top:44%;rotate:-8deg}
.tilt.r{right:max(var(--pad),calc(50% - 640px + var(--pad)));top:20%;rotate:7deg}

/* ---------- principles ---------- */
.principles{padding:0 0 clamp(80px,10vw,130px)}
.pr-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:clamp(28px,5vw,80px);align-items:center}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{background:var(--mint);border-radius:var(--r-card);padding:24px 22px 26px;min-height:190px;display:flex;flex-direction:column;transition:transform .35s cubic-bezier(.2,.8,.2,1),background .35s}
.card:hover{transform:translateY(-4px);background:var(--mint-2)}
.card svg{width:30px;height:30px;color:var(--forest);flex:none}
.card h3{font-size:20px;letter-spacing:-.02em;margin:30px 0 8px;line-height:1.2;font-weight:600}
.card p{margin:0;font-size:15.5px;line-height:1.5;color:var(--ink-2)}
.pr-side{order:2}
.pr-side h2{font-size:clamp(32px,3.8vw,50px);margin:18px 0 16px}

/* ---------- treatments / services ---------- */
.treat{padding:10px}
.treat-sheet{border-radius:var(--r-sheet);background:var(--forest);color:#fff;padding:clamp(56px,7vw,96px) 0 clamp(40px,5vw,64px);overflow:hidden;position:relative}
.treat-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap;padding:0 var(--pad)}
.treat-head h2{margin-top:18px;max-width:22ch}
.treat-head h2 em{color:var(--mint-2)}
.rail{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:44px var(--pad) 8px max(var(--pad),calc(50% - 640px + var(--pad)));scrollbar-width:none}
.rail::-webkit-scrollbar{display:none}
.t{scroll-snap-align:start;flex:0 0 clamp(264px,26vw,330px);border-radius:var(--r-card);background:var(--forest-2);border:1px solid rgba(255,255,255,.08);padding:10px 10px 24px;display:flex;flex-direction:column;transition:background .35s,transform .35s cubic-bezier(.2,.8,.2,1)}
.t:hover{transform:translateY(-4px)}
.t-img{width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;border-radius:14px;margin-bottom:20px}
.t h3{font-size:22px;letter-spacing:-.025em;margin:0 0 10px;padding:0 14px;line-height:1.15}
.t p{margin:0;padding:0 14px;font-size:15.5px;line-height:1.5;color:rgba(255,255,255,.7)}
.dots{display:none}

/* ---------- process ---------- */
.process{padding:clamp(80px,10vw,130px) 0 0}
.proc-head{display:grid;grid-template-columns:1fr 1fr;gap:24px 64px;align-items:end;margin-bottom:44px}
.steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px}
.step{position:relative;padding:26px 20px;border-radius:var(--r-card);background:var(--mist);display:flex;flex-direction:column;min-height:280px;transition:background .35s,transform .35s}
.step:hover{background:var(--mint);transform:translateY(-4px)}
.step .n{font-family:var(--serif);font-style:italic;font-weight:400;font-size:62px;line-height:.85;letter-spacing:-.03em;color:var(--teal)}
.step h3{font-size:19px;font-weight:600;letter-spacing:-.02em;line-height:1.2;margin:38px 0 10px}
.step p{margin:0;font-size:15px;line-height:1.5;color:var(--ink-2)}
.step.first{background:var(--forest);color:#fff}
.step.first .n{color:var(--mint-2)}
.step.first p{color:rgba(255,255,255,.75)}

/* ---------- founder spotlight ---------- */
.doctor{padding:10px}
.doc-sheet{border-radius:var(--r-sheet);background:var(--mist);padding:clamp(48px,7vw,96px) 0}
.doc-grid{display:grid;grid-template-columns:.85fr 1.15fr;column-gap:clamp(28px,6vw,96px);align-items:center}
.doc-photo{position:relative;border-radius:24px;overflow:hidden;aspect-ratio:572/800;background:#e2e8f0}
.doc-photo img{width:100%;height:100%;object-fit:cover;object-position:top}
.doc-badge{position:absolute;left:14px;right:14px;bottom:14px;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.92);backdrop-filter:blur(12px)}
.doc-badge b{display:block;font-size:17px;color:var(--ink)}
.doc-badge span{font-size:13.5px;color:var(--ink-3)}
.doc-head h2{margin:16px 0 8px;font-size:clamp(38px,5vw,70px)}
.doc-head .deg{font-size:16.5px;font-weight:600;color:var(--teal)}
.facts{display:grid;grid-template-columns:repeat(3,1fr);margin:24px 0 0;border-top:1px solid var(--line)}
.facts div{padding:18px 14px 0 0}
.facts div+div{padding-left:16px;border-left:1px solid var(--line)}
.facts b{display:block;font-size:clamp(28px,3vw,40px);font-weight:600;line-height:1}
.facts span{display:block;margin-top:6px;font-size:14px;color:var(--ink-3)}

/* ---------- reviews ---------- */
.reviews{padding:clamp(80px,10vw,130px) 0 clamp(60px,7vw,90px)}
.rev-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:40px}
.rev-score{margin:0;display:flex;align-items:center;gap:12px;font-size:16px;color:var(--ink-2)}
.rev-score b{font-size:42px;font-weight:600;color:var(--ink);line-height:1}
.rev-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.rev{border:1px solid var(--line);border-radius:var(--r-card);padding:26px 24px 22px;display:flex;flex-direction:column;gap:24px;background:var(--paper)}
.rev q{quotes:none;font-family:var(--serif);font-style:italic;font-size:clamp(20px,1.8vw,25px);line-height:1.3}
.rev .who{margin-top:auto;display:flex;align-items:center;gap:12px}
.rev .av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--mint);color:var(--forest);font-weight:700;font-size:13.5px}

/* ---------- visit / contact ---------- */
.visit{padding:0 0 clamp(70px,9vw,110px)}
.v-grid{display:grid;grid-template-columns:1fr 1.25fr;gap:14px}
.v-card{border-radius:var(--r-card);background:var(--mist);padding:28px;display:flex;flex-direction:column;gap:20px}
.v-card h3{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);margin-bottom:4px}
.hours{width:100%;border-collapse:collapse;font-size:15.5px}
.hours td{padding:6px 0;border-bottom:1px solid var(--line)}
.hours td:last-child{text-align:right;color:var(--ink-2);font-weight:500}
.map{border-radius:var(--r-card);overflow:hidden;min-height:380px;position:relative;background:var(--mist)}
.map iframe{position:absolute;inset:0;width:100%;height:100%;border:0}

/* ---------- footer ---------- */
.foot{padding:10px}
.foot-sheet{border-radius:var(--r-sheet);background:var(--forest);color:rgba(255,255,255,.75);padding:clamp(48px,6vw,80px) 0 0;overflow:hidden}
.f-top{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:28px;font-size:15.5px}
.f-top h4{margin:0 0 12px;font-size:14px;font-weight:600;color:#fff}
.f-top ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.word{font-size:clamp(56px,12vw,220px);line-height:.8;font-weight:600;letter-spacing:-.05em;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,.2);margin:clamp(40px,5vw,70px) 0 0;text-align:center;transform:translateY(10%)}
.word em{font-weight:400;-webkit-text-stroke:1px var(--mint-2)}
.f-bot{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;font-size:14px;color:rgba(255,255,255,.5);padding:20px var(--pad);border-top:1px solid rgba(255,255,255,.1);position:relative;z-index:1;background:var(--forest)}

/* ---------- booking dialog sheet ---------- */
.sheet{border:0;padding:0;margin:auto;width:min(460px,calc(100% - 32px));border-radius:28px;background:var(--paper);color:var(--ink);box-shadow:0 40px 90px -30px rgba(0,0,0,.6);overflow:auto}
.sheet::backdrop{background:rgba(0,0,0,.55);backdrop-filter:blur(6px)}
.sheet-in{position:relative;padding:32px 26px 26px}
.sheet .x{position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:50%;border:0;background:var(--mist);display:grid;place-items:center;color:var(--ink)}
.sheet h2{font-size:36px;margin:0 0 8px}
.sheet .sub{margin:0 0 20px;color:var(--ink-2);font-size:16px}
.num-card{background:var(--forest);color:#fff;border-radius:18px;padding:20px;margin-bottom:12px}
.num-card small{display:block;font-size:14px;color:rgba(255,255,255,.65)}
.num-card .num{display:block;margin-top:6px;font-size:38px;font-weight:600;letter-spacing:-.03em;line-height:1}
.sheet-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px}
.sheet-actions .btn{width:100%;justify-content:center}

/* ---------- mobile call bar (dock) ---------- */
.callbar{display:none}

/* ---------- EXACT $1,000 MOBILE EXPERIENCE (max-width: 640px) ---------- */
@media (max-width:640px){
  html{scroll-padding-top:76px}
  body{background:#ECEFEF;font-size:16px;padding-bottom:84px}
  h2{font-size:clamp(28px,7.8vw,36px);line-height:1.12}
  .wrap{width:100%;min-width:0;padding:0 18px}

  /* nav */
  .nav{inset:46px 0 auto}
  .nav.hide{transform:none}
  .nav-in{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 6px 5px 12px}
  .nav .book{display:none}
  .links{display:none}
  .menu-btn{display:grid}

  /* hero card */
  .hero{padding:8px 8px 7px}
  .hero-sheet{border-radius:24px;padding:92px 20px clamp(230px,64vw,320px);min-height:0;height:auto;display:block;overflow:hidden;box-shadow:0 12px 30px -10px rgba(13,40,38,.24)}
  .hero h1{font-size:clamp(40px,11.5vw,56px);line-height:1.02}
  .hero-sub{font-size:16px;margin:16px 0 24px;line-height:1.5}
  .hero-bg{height:clamp(300px,88vw,420px);top:auto;left:0;width:100%;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 55%);mask-image:linear-gradient(180deg,transparent 0,#000 55%)}

  /* about: tactile white sheet card with soft drop shadow */
  .about{margin:7px 8px;border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 28px -10px rgba(13,40,38,.1),0 2px 6px -2px rgba(13,40,38,.04);padding:36px 0 40px;position:relative;overflow:hidden}
  .tilts{display:flex;justify-content:center;gap:14px;margin-bottom:14px}
  .tilt{position:relative;left:auto!important;right:auto!important;top:auto!important;width:clamp(96px,27vw,120px);border-radius:14px}
  .about .statement{font-size:clamp(20px,5.6vw,25px);margin:18px auto 26px;padding:0 8px}

  /* principles: tactile card sheet */
  .principles{margin:7px 8px;border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 28px -10px rgba(13,40,38,.1),0 2px 6px -2px rgba(13,40,38,.04);padding:36px 0 36px;position:relative;overflow:hidden}
  .pr-grid{display:block}
  .pr-side h2{margin:0 0 16px}
  .cards{grid-template-columns:1fr;gap:10px}
  .card{border-radius:18px;padding:18px 16px 20px;min-height:0}
  .card h3{margin:18px 0 6px;font-size:18px}

  /* treatments / services: horizontal peek scroll with indicator dots */
  .treat{padding:7px 8px}
  .treat-sheet{border-radius:24px;padding:44px 0 32px;height:auto;min-height:0;display:block;overflow:hidden;box-shadow:0 12px 30px -10px rgba(13,40,38,.24)}
  .treat-head{padding:0 18px}
  .rail{padding:24px 18px 6px;gap:12px;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch}
  .rail > .t{flex:0 0 clamp(240px,72vw,285px);padding:10px 10px 22px;border-radius:18px}
  .dots{display:flex;justify-content:center;gap:5px;margin-top:14px}
  .dots button{width:6px;height:6px;padding:0;border:0;border-radius:99px;background:rgba(255,255,255,.24);transition:width .35s cubic-bezier(.2,.8,.2,1),background .3s}
  .dots button.on{width:18px;background:var(--mint-2)}

  /* process: vertical timeline card */
  .process{margin:7px 8px;border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 28px -10px rgba(13,40,38,.1),0 2px 6px -2px rgba(13,40,38,.04);padding:36px 0 36px;position:relative;overflow:hidden}
  .proc-head{display:block;margin-bottom:18px}
  .steps{display:flex;flex-direction:column;gap:10px}
  .step{display:grid;grid-template-columns:44px minmax(0,1fr);column-gap:12px;align-items:start;padding:18px 16px;min-height:0;border-radius:18px;border:1px solid var(--line)}
  .step .n{grid-row:1 / span 2;font-size:40px;line-height:1;margin-top:-2px}
  .step h3{margin:0 0 4px;font-size:17.5px}

  /* founder: unified sheet card */
  .doctor{padding:7px 8px}
  .doc-sheet{border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 28px -10px rgba(13,40,38,.1),0 2px 6px -2px rgba(13,40,38,.04);padding:36px 0 40px;overflow:hidden}
  .doc-grid{display:flex;flex-direction:column;gap:20px}
  .doc-photo{aspect-ratio:4/4.2;width:100%;border-radius:18px}
  .doc-head h2{font-size:clamp(32px,9vw,42px);margin:0 0 6px}

  /* reviews: stacked review cards */
  .reviews{margin:7px 8px;border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 28px -10px rgba(13,40,38,.1),0 2px 6px -2px rgba(13,40,38,.04);padding:36px 0 40px;position:relative;overflow:hidden}
  .rev-head{display:flex;flex-direction:column;align-items:flex-start;gap:12px;margin-bottom:20px}
  .rev-grid{display:flex;flex-direction:column;gap:12px}
  .rev{padding:20px 18px;border-radius:18px;background:var(--mist);border:1px solid var(--line)}
  .rev q{font-size:18px}

  /* visit: hours + map card */
  .visit{margin:7px 8px;border-radius:24px;background:#FFFFFF;border:1px solid var(--line);box-shadow:0 10px 28px -10px rgba(13,40,38,.1),0 2px 6px -2px rgba(13,40,38,.04);padding:36px 0 40px;position:relative;overflow:hidden}
  .v-grid{display:flex;flex-direction:column;gap:14px}
  .v-card{padding:20px 18px;border-radius:18px;border:1px solid var(--line);background:var(--mist)}
  .map{min-height:240px;height:240px;border-radius:18px}

  /* footer */
  .foot{padding:7px 8px 16px}
  .foot-sheet{border-radius:24px;padding:40px 0 0;box-shadow:0 12px 30px -10px rgba(13,40,38,.24)}
  .f-top{grid-template-columns:1fr;gap:24px}
  .f-bot{flex-direction:column;gap:8px;padding:16px 18px 84px}
  .word{font-size:clamp(36px,11vw,50px);margin:16px 0 4px}

  /* bottom floating call dock */
  .callbar{display:flex;align-items:center;position:fixed;z-index:85;left:8px;right:8px;bottom:8px;gap:6px;padding:6px;border-radius:999px;background:rgba(20,24,27,.94);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 40px -16px rgba(0,0,0,.6);transform:translateY(calc(100% + 16px));transition:transform .45s cubic-bezier(.2,.8,.2,1)}
  .callbar.show{transform:none}
  .callbar a,.callbar button{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 10px;border:0;border-radius:999px;background:none;font-weight:600;font-size:15px;color:#fff;white-space:nowrap}
  .callbar .cb-menu{flex:none;width:44px;padding:0;background:rgba(255,255,255,.1)}
  .callbar .wa{background:var(--mint);color:var(--forest)}
}
</style>
</head>
<body>

${
  agencyBarEnabled
    ? `
<aside class="pinsite-bar" role="banner" aria-label="Pinsite Concept Preview">
  <div class="pinsite-bar-left">
    <span class="pinsite-pill">LIVE CONCEPT</span>
    <span class="pinsite-bar-txt">Designed for <b>${escapeHtml(data.businessName)}</b> by Pinsite Agency</span>
  </div>
  <a href="${escapeHtml(claimUrl)}" target="_blank" rel="noopener noreferrer" class="pinsite-claim">
    <span>Claim This Website</span>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
  </a>
</aside>`
    : ""
}

<!-- MOBILE DRAWER MENU -->
<div class="menu" id="menu" tabindex="-1" role="dialog" aria-modal="true" aria-label="Menu" aria-hidden="true">
  <div class="menu-top">
    <b>${escapeHtml(data.businessName)}</b>
    <button type="button" class="menu-x" id="menu-close" aria-label="Close menu">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
  </div>
  <nav aria-label="Sections">
    <a href="#services"><span>Services</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
    <a href="#about"><span>About</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
    <a href="#process"><span>Process</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
    <a href="#reviews"><span>Reviews</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
    <a href="#contact"><span>Contact</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
  </nav>
  <div style="margin-top:auto">
    <button type="button" class="btn btn-mint" data-book style="width:100%;justify-content:center">
      <span>${escapeHtml(data.hero.primaryCtaText || "Get Quote")}</span>
    </button>
  </div>
</div>

<header class="nav" id="nav">
  <div class="wrap">
    <div class="nav-in">
      <a class="brand" href="#top">
        <span><b>${escapeHtml(data.businessName)}</b><small>${escapeHtml(data.area)}, ${escapeHtml(data.city)}</small></span>
      </a>
      <nav class="links">
        <a href="#services">Services</a>
        <a href="#about">About</a>
        <a href="#process">Process</a>
        <a href="#reviews">Reviews</a>
        <a href="#contact">Contact</a>
      </nav>
      <div class="nav-act">
        <button type="button" class="btn btn-mint book" data-book>
          <span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
          <span>${escapeHtml(data.hero.primaryCtaText || "Get Quote")}</span>
        </button>
        <button type="button" class="menu-btn" id="menu-open" aria-label="Open menu"><span></span></button>
      </div>
    </div>
  </div>
</header>

<main id="top">

<!-- HERO -->
<section class="hero">
  <div class="hero-sheet">
    <div class="hero-copy">
      <div>
        <h1>
          <span class="ln"><span>${escapeHtml(data.hero.h1Line1)}</span></span>
          <span class="ln"><span>${escapeHtml(data.hero.h1Line2)}</span></span>
          <span class="ln"><span>${data.hero.h1Line3Emphasis ? `<em>${escapeHtml(data.hero.h1Line3Emphasis)}</em>` : ""}</span></span>
        </h1>
        <p class="hero-sub">${escapeHtml(data.hero.subheadline)}</p>
        <div class="cta-row">
          <button type="button" class="btn btn-mint" data-book>
            <span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
            <span>${escapeHtml(data.hero.primaryCtaText || "Book Consultation")}</span>
          </button>
          <a class="btn btn-ghost" href="#services">
            <span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
            <span>${escapeHtml(data.hero.secondaryCtaText || "Explore Services")}</span>
          </a>
        </div>
      </div>
    </div>
    <div class="hero-bg" role="img" aria-label="${escapeHtml(data.businessName)} Showcase"></div>
  </div>
</section>

<!-- ABOUT / STATEMENT -->
<section class="about" id="about">
  <div class="tilts">
    <figure class="tilt l reveal"><img src="${escapeHtml(tiltL)}" alt="${escapeHtml(data.businessName)} Work" loading="lazy"></figure>
    <figure class="tilt r reveal"><img src="${escapeHtml(tiltR)}" alt="${escapeHtml(data.businessName)} Facility" loading="lazy"></figure>
  </div>
  <div class="wrap">
    <p class="statement reveal">${data.philosophy.statementHtml}</p>
    <a class="btn btn-ink reveal" href="#founder">
      <span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
      <span>${escapeHtml(data.philosophy.ctaText || "Meet Our Team")}</span>
    </a>
  </div>
</section>

<!-- PRINCIPLES -->
<section class="principles">
  <div class="wrap pr-grid">
    <div class="pr-side reveal">
      <h2>${escapeHtml(data.principles.heading)} ${data.principles.headingEmphasis ? `<em>${escapeHtml(data.principles.headingEmphasis)}</em>` : ""}</h2>
      <p class="lede">${escapeHtml(data.principles.lede)}</p>
    </div>
    <div class="cards">
      ${pillarsHtml}
    </div>
  </div>
</section>

<!-- SERVICES (RAIL) -->
<section class="treat" id="services">
  <div class="treat-sheet">
    <div class="wrap treat-head">
      <div>
        <h2>${escapeHtml(data.servicesSection.heading)} ${data.servicesSection.headingEmphasis ? `<em>${escapeHtml(data.servicesSection.headingEmphasis)}</em>` : ""}</h2>
      </div>
    </div>
    <div class="rail" id="service-rail">
      ${servicesHtml}
    </div>
  </div>
</section>

<!-- PROCESS -->
<section class="process" id="process">
  <div class="wrap">
    <div class="proc-head reveal">
      <h2>${escapeHtml(data.process.heading)}<br>${data.process.headingEmphasis ? `<em>${escapeHtml(data.process.headingEmphasis)}</em>` : ""}</h2>
      <p class="lede">${escapeHtml(data.process.lede)}</p>
    </div>
    <ol class="steps">
      ${stepsHtml}
    </ol>
  </div>
</section>

<!-- FOUNDER / EXPERT -->
<section class="doctor" id="founder">
  <div class="doc-sheet">
    <div class="wrap doc-grid">
      <div class="doc-photo reveal">
        <img src="${escapeHtml(founderImg)}" alt="${escapeHtml(data.founder.name)}">
        <div class="doc-badge">
          <div>
            <b>${escapeHtml(data.founder.name)}</b>
            <span>${escapeHtml(data.founder.badgeLocation || data.area)}</span>
          </div>
        </div>
      </div>
      <div class="doc-head reveal">
        <h2>${escapeHtml(data.founder.name)} ${data.founder.nameEmphasis ? `<em>${escapeHtml(data.founder.nameEmphasis)}</em>` : ""}</h2>
        <div class="deg">${escapeHtml(data.founder.titleOrCredentials)}</div>
        <div class="facts">
          <div><b>${escapeHtml(data.founder.yearsExperience)}</b><span>Years Experience</span></div>
          <div><b>${escapeHtml(data.founder.reviewCount)}</b><span>Verified Reviews</span></div>
          <div><b>${escapeHtml(data.founder.ratingScore)}</b><span>Client Rating</span></div>
        </div>
        <p style="color:var(--ink-2);font-size:17px;margin:20px 0 28px">${escapeHtml(data.founder.bio)}</p>
        <button type="button" class="btn btn-ink" data-book>
          <span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
          <span>Schedule Directly</span>
        </button>
      </div>
    </div>
  </div>
</section>

<!-- REVIEWS -->
<section class="reviews" id="reviews">
  <div class="wrap">
    <div class="rev-head reveal">
      <div>
        <h2>${escapeHtml(data.reviews.heading)} ${data.reviews.headingEmphasis ? `<em>${escapeHtml(data.reviews.headingEmphasis)}</em>` : ""}</h2>
      </div>
      <p class="rev-score"><b>${escapeHtml(data.reviews.ratingScore)}</b><span>${escapeHtml(data.reviews.ratingSummary)}</span></p>
    </div>
    <div class="rev-grid">
      ${reviewsHtml}
    </div>
  </div>
</section>

<!-- VISIT / CONTACT -->
<section class="visit" id="contact">
  <div class="wrap">
    <h2 class="reveal" style="margin-bottom:24px">${escapeHtml(data.location.headingArea)}, <em>${escapeHtml(data.location.headingCity)}.</em></h2>
    <div class="v-grid">
      <div class="v-card reveal">
        <div>
          <h3>Direct Contact</h3>
          <p style="font-weight:600;font-size:20px">${escapeHtml(data.phone)}</p>
        </div>
        <div>
          <h3>Operating Address</h3>
          <p>${escapeHtml(data.fullAddress)}</p>
        </div>
        <div>
          <h3>Working Hours</h3>
          <table class="hours">
            <tr><td>Standard</td><td>${escapeHtml(data.location.morningHours || "8:00 am – 5:00 pm")}</td></tr>
            <tr><td>Emergency / Weekend</td><td>${escapeHtml(data.location.eveningHours || "On Call / By Appointment")}</td></tr>
          </table>
        </div>
        <div style="margin-top:auto">
          <button type="button" class="btn btn-ink" data-book style="width:100%;justify-content:center">
            <span class="dot"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></span>
            <span>Contact ${escapeHtml(data.businessName)}</span>
          </button>
        </div>
      </div>
      <div class="map reveal">
        <iframe title="Map location for ${escapeHtml(data.businessName)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(data.location.mapQuery || data.fullAddress)}&z=15&output=embed"></iframe>
      </div>
    </div>
  </div>
</section>

</main>

<!-- FOOTER -->
<footer class="foot">
  <div class="foot-sheet">
    <div class="wrap f-top">
      <div>
        <a class="brand" href="#top" style="color:#fff">
          <span><b>${escapeHtml(data.businessName)}</b><small>${escapeHtml(data.tagline || data.niche)}</small></span>
        </a>
        <p style="margin:14px 0 0;color:rgba(255,255,255,.7)">${escapeHtml(data.footer.summary)}</p>
      </div>
      <div>
        <h4>Direct Inquiries</h4>
        <ul>
          <li><a href="tel:${phoneRaw}">${escapeHtml(data.phone)}</a></li>
          <li><a href="https://wa.me/${waRaw}">WhatsApp Direct</a></li>
          <li><button type="button" data-book style="background:none;border:0;color:inherit;padding:0">Book Consultation</button></li>
        </ul>
      </div>
      <div>
        <h4>Location</h4>
        <p style="color:rgba(255,255,255,.7);line-height:1.4">${escapeHtml(data.fullAddress)}</p>
      </div>
    </div>
    <div class="word" aria-hidden="true">${escapeHtml(data.footer.hollowWord)} <em>${escapeHtml(data.footer.hollowWordEmphasis)}</em></div>
    <div class="wrap f-bot">
      <span>© ${new Date().getFullYear()} ${escapeHtml(data.businessName)}. All rights reserved.</span>
      <span>Concept preview created by Pinsite Agency</span>
    </div>
  </div>
</footer>

<!-- FLOATING MOBILE BOTTOM DOCK -->
<div class="callbar" id="callbar">
  <button type="button" class="cb-menu" id="cb-menu" aria-label="Open navigation menu"><span></span></button>
  <a href="tel:${phoneRaw}" style="display:flex;align-items:center;justify-content:center;gap:6px">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>
    <span>Call Now</span>
  </a>
  <a href="https://wa.me/${waRaw}" target="_blank" rel="noopener noreferrer" class="wa">
    <span>WhatsApp</span>
  </a>
</div>

<!-- BOOKING DIALOG MODAL -->
<dialog class="sheet" id="book-modal">
  <div class="sheet-in">
    <button type="button" class="x" id="modal-close" aria-label="Close">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <h2>Get in <em>touch.</em></h2>
    <p class="sub">Reach ${escapeHtml(data.businessName)} directly via phone or WhatsApp.</p>
    <div class="num-card">
      <small>Direct Phone Line</small>
      <strong class="num">${escapeHtml(data.phone)}</strong>
    </div>
    <div class="sheet-actions">
      <a class="btn btn-ink" href="tel:${phoneRaw}">
        <span>Call Now</span>
      </a>
      <a class="btn btn-line" href="https://wa.me/${waRaw}" target="_blank" rel="noopener noreferrer">
        <span>WhatsApp</span>
      </a>
    </div>
    <p style="font-size:14px;color:var(--ink-3);margin:0;line-height:1.4">${escapeHtml(data.fullAddress)}</p>
  </div>
</dialog>

<script>
(function(){
  var d = document;
  function loaded(){ d.documentElement.classList.add('loaded'); d.body.classList.add('loaded'); }
  requestAnimationFrame(loaded); setTimeout(loaded, 60);

  // Scroll animations
  var els = d.querySelectorAll('.reveal');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, {rootMargin:'0px 0px -8% 0px'});
    els.forEach(function(el, i){ el.style.transitionDelay = (i % 4) * 60 + 'ms'; io.observe(el); });
  } else {
    els.forEach(function(el){ el.classList.add('in'); });
  }

  // Nav glass effect & mobile callbar show/hide
  var nav = d.getElementById('nav');
  var callbar = d.getElementById('callbar');
  var hero = d.querySelector('.hero');
  function onScroll(){
    var y = scrollY;
    if (nav) {
      nav.classList.toggle('solid', y > 180);
      nav.classList.toggle('glass', y > 20 && y <= 180);
    }
    if (callbar && hero) {
      var heroEnd = hero.offsetTop + hero.offsetHeight - 120;
      callbar.classList.toggle('show', y > heroEnd);
    }
  }
  addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  // Mobile menu drawer
  var menu = d.getElementById('menu');
  var mOpen = d.getElementById('menu-open');
  var mClose = d.getElementById('menu-close');
  var cbMenu = d.getElementById('cb-menu');
  function openMenu(){ if(menu){ menu.classList.add('open'); menu.setAttribute('aria-hidden','false'); } }
  function closeMenu(){ if(menu){ menu.classList.remove('open'); menu.setAttribute('aria-hidden','true'); } }
  if(mOpen) mOpen.addEventListener('click', openMenu);
  if(cbMenu) cbMenu.addEventListener('click', openMenu);
  if(mClose) mClose.addEventListener('click', closeMenu);
  if(menu){
    menu.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', closeMenu); });
  }

  // Service rail swipe indicator dots
  var rail = d.getElementById('service-rail');
  if(rail){
    var items = [].slice.call(rail.children);
    if(items.length > 1){
      var dots = d.createElement('div');
      dots.className = 'dots';
      var dotBtns = items.map(function(it, idx){
        var b = d.createElement('button');
        b.type = 'button';
        b.tabIndex = -1;
        b.addEventListener('click', function(){
          rail.scrollTo({left: it.offsetLeft - items[0].offsetLeft, behavior:'smooth'});
        });
        dots.appendChild(b);
        return b;
      });
      rail.after(dots);
      function updateDots(){
        var step = items[1].offsetLeft - items[0].offsetLeft;
        var curIdx = Math.round(rail.scrollLeft / step);
        dotBtns.forEach(function(btn, j){ btn.classList.toggle('on', j === curIdx); });
      }
      rail.addEventListener('scroll', updateDots, {passive:true});
      updateDots();
    }
  }

  // Modal dialog
  var modal = d.getElementById('book-modal');
  var closeBtn = d.getElementById('modal-close');
  d.querySelectorAll('[data-book]').forEach(function(btn){
    btn.addEventListener('click', function(){
      if (modal) {
        if (modal.showModal) modal.showModal();
        else modal.setAttribute('open', '');
      }
    });
  });
  if (closeBtn && modal) {
    closeBtn.addEventListener('click', function(){
      if (modal.close) modal.close();
      else modal.removeAttribute('open');
    });
    modal.addEventListener('click', function(e){
      if (e.target === modal) {
        if (modal.close) modal.close();
        else modal.removeAttribute('open');
      }
    });
  }
})();
</script>
</body>
</html>`;
}
