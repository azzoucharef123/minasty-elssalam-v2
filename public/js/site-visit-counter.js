(() => {
  const counters = Array.from(document.querySelectorAll("[data-site-visit-count]"));
  if (!counters.length) return;

  const numberFormatter = new Intl.NumberFormat("ar-DZ");

  function render(value) {
    const totalVisits = Number(value);
    if (!Number.isFinite(totalVisits) || totalVisits < 0) return;
    counters.forEach((counter) => {
      counter.textContent = numberFormatter.format(totalVisits);
    });
  }

  fetch("/api/site-analytics/visits", {
    method: "GET",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then((response) => response.json().then((data) => ({ response, data })))
    .then(({ response, data }) => {
      if (!response.ok || data.status !== "success") throw new Error("VISIT_COUNTER_UNAVAILABLE");
      render(data.totalVisits);
    })
    .catch(() => {
      counters.forEach((counter) => {
        counter.textContent = "—";
      });
    });
})();
