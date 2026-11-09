export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "GET") {
    return new Response("Método no permitido", { status: 405 });
  }

  try {
    if (!env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("Falta configurar FIREBASE_SERVICE_ACCOUNT");
    }

    const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const projectId = account.project_id;

    // Crear token privado para consultar Firestore
    const base64url = (value) =>
      btoa(String.fromCharCode(...new Uint8Array(value)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

    const encode = (value) =>
      base64url(new TextEncoder().encode(JSON.stringify(value)));

    const now = Math.floor(Date.now() / 1000);

    const header = encode({ alg: "RS256", typ: "JWT" });
    const payload = encode({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    });

    const unsignedToken = `${header}.${payload}`;

    const pem = account.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, "")
      .replace(/-----END PRIVATE KEY-----/g, "")
      .replace(/\s/g, "");

    const binary = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      binary,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      privateKey,
      new TextEncoder().encode(unsignedToken)
    );

    const jwt = `${unsignedToken}.${base64url(signature)}`;

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
          assertion: jwt
        })
      }
    );

    if (!tokenResponse.ok) {
      throw new Error("No se pudo autenticar con Firebase");
    }

    const { access_token } = await tokenResponse.json();

    // Fecha actual de Uruguay
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Montevideo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

    const getPart = type => parts.find(p => p.type === type).value;

    const today = new Date(Date.UTC(
      Number(getPart("year")),
      Number(getPart("month")) - 1,
      Number(getPart("day"))
    ));

    const days = [];

    for (let i = 0; i < 7; i++) {
      const dateObject = new Date(today);
      dateObject.setUTCDate(today.getUTCDate() + i);

      const date = [
        dateObject.getUTCFullYear(),
        String(dateObject.getUTCMonth() + 1).padStart(2, "0"),
        String(dateObject.getUTCDate()).padStart(2, "0")
      ].join("-");

      const weekday = dateObject.getUTCDay();

      let start;
      let end;

      if (weekday === 0) {
        days.push({ fecha: date, cerrado: true, horarios: [] });
        continue;
      } else if (weekday === 6) {
        start = 14 * 60;
        end = 18 * 60;
      } else {
        start = 12 * 60;
        end = 18 * 60 + 30;
      }

      const query = {
        structuredQuery: {
          from: [{ collectionId: "citas" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "fecha" },
              op: "EQUAL",
              value: { stringValue: date }
            }
          },
          select: {
            fields: [
              { fieldPath: "fecha" },
              { fieldPath: "hora" },
              { fieldPath: "estado" }
            ]
          }
        }
      };

      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(query)
        }
      );

      if (!response.ok) {
        throw new Error("No se pudieron consultar las citas");
      }

      const results = await response.json();
      const occupied = new Set();

      for (const item of results) {
        const fields = item.document?.fields;
        if (!fields) continue;

        const hour = fields.hora?.stringValue;
        const status = (fields.estado?.stringValue || "").toLowerCase();

        if (
          hour &&
          !["cancelado", "cancelada", "anulado", "anulada"].includes(status)
        ) {
          occupied.add(hour);
        }
      }

      const horarios = [];

      for (let minute = start; minute <= end; minute += 30) {
        const hour =
          String(Math.floor(minute / 60)).padStart(2, "0") +
          ":" +
          String(minute % 60).padStart(2, "0");

        horarios.push({
          hora: hour,
          disponible: !occupied.has(hour)
        });
      }

      days.push({
        fecha: date,
        cerrado: false,
        horarios
      });
    }

    return new Response(JSON.stringify({ dias: days }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: "No se pudo consultar la disponibilidad." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}
