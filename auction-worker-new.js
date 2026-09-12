/* Astro Cars - Auction Worker
   Connects index.html + admin.html
   Cloudflare Worker
   GitHub token stays on the Worker
*/

const json = (data, status = 200) => new Response(
  JSON.stringify(data),
  {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  }
);

const enc = s => btoa(unescape(encodeURIComponent(s)));
const dec = s => decodeURIComponent(escape(atob((s || "").replace(/\n/g, ""))));

async function github(env, path, options = {}) {
  return fetch(
    `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}?ref=${env.GITHUB_BRANCH}`,
    {
      ...options,
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(options.headers || {})
      }
    }
  );
}

async function readBids(env) {
  const r = await github(env, "auction-bids.json");

  if (r.status === 404) {
    return { data: [], sha: null };
  }

  if (!r.ok) {
    throw new Error("GitHub read failed");
  }

  const j = await r.json();

  let data = [];

  try {
    data = JSON.parse(dec(j.content || "[]"));
  } catch (_) {
    data = [];
  }

  return {
    data: Array.isArray(data) ? data : [],
    sha: j.sha
  };
}

async function saveBids(env, data, sha) {
  const body = {
    message: "Astro Cars: new auction bid",
    content: enc(JSON.stringify(data, null, 2)),
    branch: env.GITHUB_BRANCH
  };

  if (sha) {
    body.sha = sha;
  }

  return github(env, "auction-bids.json", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

function validPhone(phone) {
  return /^[+]?[0-9 ()-]{8,20}$/.test(phone);
}

export default {
  async fetch(request, env) {

    if (request.method === "OPTIONS") {
      return new Response("", {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        }
      });
    }

    try {

      if (!env.GITHUB_TOKEN) {
        return json({
          ok: false,
          error: "Worker is not configured"
        }, 500);
      }

      const url = new URL(request.url);

      /* =========================
         GET BIDS
      ========================= */

      if (
        request.method === "GET" &&
        url.pathname.endsWith("/bids")
      ) {

        const { data } = await readBids(env);

        return json({
          ok: true,
          bids: data
        });
      }

      /* =========================
         POST NEW BID
      ========================= */

      if (
        request.method === "POST" &&
        url.pathname.endsWith("/bids")
      ) {

        const b = await request.json();

        const auctionId = String(
          b.auctionId || ""
        ).trim();

        const car = String(
          b.car || ""
        ).trim();

        const phone = String(
          b.phone || ""
        ).trim();

        const image = String(
          b.image || ""
        ).trim();

        const amount = Number(b.amount);

        if (
          !auctionId ||
          !car ||
          !phone ||
          !validPhone(phone) ||
          !Number.isFinite(amount) ||
          amount <= 0
        ) {
          return json({
            ok: false,
            error: "بيانات المزايدة غير صحيحة"
          }, 400);
        }

        const bid = {
          id:
            "bid-" +
            Date.now().toString(36) +
            "-" +
            crypto.randomUUID().slice(0, 8),

          auctionId,
          car,
          phone,
          amount,
          image,

          createdAt:
            new Date().toISOString(),

          status: "pending"
        };

        /* Retry if GitHub file changed */
        for (let attempt = 0; attempt < 5; attempt++) {

          const current = await readBids(env);

          current.data.push(bid);

          const result = await saveBids(
            env,
            current.data,
            current.sha
          );

          if (result.ok) {

            return json({
              ok: true,
              bid
            });
          }

          if (result.status !== 409) {
            break;
          }
        }

        return json({
          ok: false,
          error: "تعذر حفظ المزايدة"
        }, 500);
      }

      /* =========================
         HEALTH CHECK
      ========================= */

      if (
        request.method === "GET" &&
        (
          url.pathname === "/" ||
          url.pathname.endsWith("/health")
        )
      ) {

        return json({
          ok: true,
          service: "Astro Cars Auction Worker",
          status: "online"
        });
      }

      return json({
        ok: false,
        error: "Not found"
      }, 404);

    } catch (error) {

      return json({
        ok: false,
        error: String(
          error?.message || error
        )
      }, 500);
    }
  }
};