(() => {
  const header = document.querySelector(".site-header"),
    toggle = header?.querySelector(".nav-toggle"),
    nav = header?.querySelector(".nav-links");
  if (!header || !toggle || !nav) return;
  header.classList.add("nav-ready");
  const groups = [...nav.querySelectorAll(".nav-group")],
    mobile = matchMedia("(max-width:820px)");
  function closeMenu(restore = false) {
    header.classList.remove("nav-open");
    toggle.setAttribute("aria-expanded", "false");
    groups.forEach((group) => (group.open = false));
    if (restore) toggle.focus();
  }
  toggle.addEventListener("click", () => {
    const open = !header.classList.contains("nav-open");
    header.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    if (!open) groups.forEach((group) => (group.open = false));
  });
  groups.forEach((group) => {
    group.querySelector("summary").addEventListener("click", () =>
      groups.forEach((other) => {
        if (other !== group) other.open = false;
      }),
    );
    group.addEventListener("focusout", (event) => {
      if (event.relatedTarget && !group.contains(event.relatedTarget))
        group.open = false;
    });
  });
  document.addEventListener("pointerdown", (event) => {
    if (!header.contains(event.target)) closeMenu();
  });
  header.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const opened = groups.find((group) => group.open);
    if (opened) {
      event.preventDefault();
      opened.open = false;
      opened.querySelector("summary").focus();
    } else if (header.classList.contains("nav-open")) {
      event.preventDefault();
      closeMenu(true);
    }
  });
  header.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !header.contains(event.relatedTarget))
      closeMenu();
  });
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });
  mobile.addEventListener("change", () => closeMenu());
})();
