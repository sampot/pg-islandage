export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-islandage",
      path: new URL(request.url).pathname,
    });
  },
};
