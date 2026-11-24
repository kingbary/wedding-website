(function () {
  "use strict";

  var WEDDING_DATE = new Date(2026, 10, 27);
  var STORAGE_KEY = "ek-rsvp";

  var RSVP_ENDPOINT =
    "https://script.google.com/macros/s/AKfycbyvY0drVaFpoVvCyTMHunK6lZ0GJfhv_V9rXsBxpc0pz2WFJ5pJ5FpM9YsNcOxa3uDLWw/exec";

  var PAYSTACK_PUBLIC_KEY = "pk_live_ea8d619e619544bb6a6c0d08f1adfa886f36657f";
  var GIFT_MIN_NAIRA = 100;

  // — Countdown —
  var countdownEl = document.querySelector("[data-countdown]");
  function updateCountdown() {
    if (!countdownEl) return;
    var days = Math.ceil((WEDDING_DATE - Date.now()) / 864e5);
    countdownEl.textContent =
      days > 1
        ? days + " days to go"
        : days === 1
          ? "Tomorrow"
          : days === 0
            ? "Today"
            : "Just married";
  }
  updateCountdown();
  setInterval(updateCountdown, 60000);

  // — Gallery lightbox —
  // Each gallery link points at the full image, so without JS it still opens.
  var gallery = document.querySelector("[data-gallery]");
  var lightbox = document.querySelector("[data-lightbox]");

  // — Shuffle the gallery on every visit —
  // Runs before the "See all" and lightbox code so both follow the new order.
  // Without JS the photos show in the order written in index.html.
  if (gallery) {
    var shuffled = Array.prototype.slice.call(gallery.querySelectorAll(".gallery-item"));
    for (var s = shuffled.length - 1; s > 0; s--) {
      var r = Math.floor(Math.random() * (s + 1));
      var tmp = shuffled[s];
      shuffled[s] = shuffled[r];
      shuffled[r] = tmp;
    }
    shuffled.forEach(function (item) { gallery.appendChild(item); });
  }

  // — Gallery "See all photos" —
  // Shows the first GALLERY_PREVIEW photos; the button reveals the rest.
  // Without JS every photo simply shows.
  var GALLERY_PREVIEW = 6;
  var galleryMore = document.querySelector("[data-gallery-more]");
  if (gallery && galleryMore) {
    var total = gallery.querySelectorAll(".gallery-item").length;
    if (total > GALLERY_PREVIEW) {
      var toggle = galleryMore.querySelector("[data-gallery-toggle]");
      var toggleLabel = galleryMore.querySelector("[data-gallery-toggle-label]");
      var setCollapsed = function (collapsed) {
        gallery.classList.toggle("is-collapsed", collapsed);
        toggle.setAttribute("aria-expanded", String(!collapsed));
        toggleLabel.textContent = collapsed ? "See all " + total + " photos" : "Show fewer";
      };
      setCollapsed(true);
      galleryMore.hidden = false;
      toggle.addEventListener("click", function () {
        var collapsing = !gallery.classList.contains("is-collapsed");
        setCollapsed(collapsing);
        // After collapsing, bring the gallery back into view.
        if (collapsing) document.getElementById("gallery").scrollIntoView({ block: "start" });
      });
    }
  }
  if (gallery && lightbox && typeof lightbox.showModal === "function") {
    var items = Array.prototype.slice.call(gallery.querySelectorAll("a"));
    var lbImg = lightbox.querySelector("[data-lightbox-img]");
    var lbCount = lightbox.querySelector("[data-lightbox-count]");
    var lbFigure = lightbox.querySelector(".lightbox-figure");
    var current = 0;

    var show = function (i) {
      current = (i + items.length) % items.length;
      var link = items[current];
      var thumb = link.querySelector("img");
      lbImg.src = link.getAttribute("href");
      lbImg.alt = thumb ? thumb.alt : "";
      lbCount.textContent = current + 1 + " / " + items.length;
      // Warm the next photo so arrowing through feels instant.
      var next = items[(current + 1) % items.length];
      if (next) new Image().src = next.getAttribute("href");
    };

    var open = function (i) {
      show(i);
      lightbox.showModal();
      document.documentElement.classList.add("lightbox-open");
    };

    items.forEach(function (link, i) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        open(i);
      });
    });

    lightbox.addEventListener("close", function () {
      document.documentElement.classList.remove("lightbox-open");
      if (items[current]) items[current].focus();
    });

    lightbox.querySelector("[data-lightbox-prev]").addEventListener("click", function () { show(current - 1); });
    lightbox.querySelector("[data-lightbox-next]").addEventListener("click", function () { show(current + 1); });
    lightbox.querySelector("[data-lightbox-close]").addEventListener("click", function () { lightbox.close(); });

    lightbox.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); show(current - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); show(current + 1); }
    });

    // Clicking the dark area around the photo closes the viewer.
    var swiped = false;
    lbFigure.addEventListener("click", function (e) {
      if (swiped) { swiped = false; return; }
      if (e.target === lbFigure) lightbox.close();
    });

    // Swipe left/right on phones.
    var startX = null;
    lbFigure.addEventListener("pointerdown", function (e) { startX = e.clientX; swiped = false; });
    lbFigure.addEventListener("pointerup", function (e) {
      if (startX === null) return;
      var dx = e.clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) {
        swiped = true;
        show(current + (dx < 0 ? 1 : -1));
      }
    });
  }

  // — Copy account number —
  var copyBtn = document.querySelector("[data-copy]");
  var copyLabel = document.querySelector("[data-copy-label]");
  var acctEl = document.querySelector("[data-acct]");
  var copyTimer;
  if (copyBtn && acctEl) {
    copyBtn.addEventListener("click", function () {
      var text = acctEl.textContent.trim();
      var done = function () {
        copyLabel.textContent = "Copied";
        clearTimeout(copyTimer);
        copyTimer = setTimeout(function () {
          copyLabel.textContent = "Copy";
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        done();
      }
    });
  }

  // — RSVP —
  // Replies are posted to the Google Sheet (RSVP_ENDPOINT). The browser also
  // remembers a successful reply so returning guests see the thank-you note.
  var formWrap = document.querySelector("[data-rsvp-form]");
  var thanksWrap = document.querySelector("[data-rsvp-thanks]");
  var form = formWrap && formWrap.querySelector("form");
  var errorEl = document.querySelector("[data-rsvp-error]");
  var nameEl = document.querySelector("[data-rsvp-name]");
  var resetBtn = document.querySelector("[data-rsvp-reset]");

  function showError(msg) {
    errorEl.textContent = msg || "";
    errorEl.hidden = !msg;
  }

  function showThanks(firstName) {
    nameEl.textContent = firstName;
    formWrap.hidden = true;
    thanksWrap.hidden = false;
  }

  function showForm() {
    showError("");
    thanksWrap.hidden = true;
    formWrap.hidden = false;
  }

  function remember(entry) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    } catch (e) {}
  }

  function sendRsvp(entry) {
    if (!RSVP_ENDPOINT) {
      console.warn(
        "RSVP_ENDPOINT is not set; the RSVP was only saved in this browser.",
      );
      remember(entry);
      return Promise.resolve();
    }
    // A plain form-encoded POST is a "simple" CORS request, which Apps Script accepts.
    var body = new URLSearchParams({
      name: entry.name,
      phone: entry.phone,
      website: entry.website || "",
    });
    return fetch(RSVP_ENDPOINT, { method: "POST", body: body })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok)
          throw new Error((data && data.error) || "Not saved");
        remember(entry);
      });
  }

  var submitBtn = form && form.querySelector('button[type="submit"]');
  var submitHtml = submitBtn && submitBtn.innerHTML;
  var sending = false;

  function setSending(on) {
    sending = on;
    if (!submitBtn) return;
    submitBtn.disabled = on;
    if (on) submitBtn.textContent = "Sending…";
    else submitBtn.innerHTML = submitHtml;
  }

  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && saved.name && formWrap) showThanks(saved.name.split(" ")[0]);
  } catch (e) {}

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (sending) return;
      var fd = new FormData(form);
      var name = String(fd.get("name") || "").trim();
      var phone = String(fd.get("phone") || "").trim();
      var website = String(fd.get("website") || "").trim();
      // Honeypot filled in: almost certainly a bot. Act as if it worked, send nothing.
      if (website) {
        form.reset();
        showThanks(name.split(" ")[0] || "friend");
        return;
      }
      if (!name || !phone)
        return showError("Please add your name and phone number.");
      if (phone.replace(/\D/g, "").length < 7)
        return showError("Please check your phone number.");
      showError("");
      setSending(true);
      sendRsvp({ name: name, phone: phone, at: Date.now() })
        .then(function () {
          setSending(false);
          form.reset();
          showThanks(name.split(" ")[0]);
        })
        .catch(function (err) {
          console.error("RSVP failed:", err);
          setSending(false);
          showError(
            "Sorry, we couldn't send your RSVP. Please check your connection and try again.",
          );
        });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      showForm();
    });
  }

  // — Online gifts (Paystack) —
  // Opens Paystack's checkout popup. After a successful payment the reference is
  // sent to the Apps Script, which verifies it with Paystack and logs the gift
  // on the "Gifts" tab. Paystack's dashboard remains the record of truth.
  var give = document.querySelector("[data-give]");
  if (give && PAYSTACK_PUBLIC_KEY) {
    give.hidden = false;
    var giveLead = document.querySelector("[data-give-lead]");
    if (giveLead)
      giveLead.textContent =
        "If you would like to bless our new beginning with a gift, you can give online or by bank transfer.";

    var giveFormWrap = give.querySelector("[data-give-form]");
    var giveThanks = give.querySelector("[data-give-thanks]");
    var giveForm = giveFormWrap.querySelector("form");
    var giveError = give.querySelector("[data-give-error]");
    var giveSubmit = give.querySelector("[data-give-submit]");
    var customWrap = give.querySelector("[data-give-custom]");
    var customInput = give.querySelector("#give-amount");
    var giveBusy = false;

    var naira = function (n) {
      return "₦" + n.toLocaleString("en-NG");
    };

    var giveErr = function (msg) {
      giveError.textContent = msg || "";
      giveError.hidden = !msg;
    };

    var chosenAmount = function () {
      var picked = giveForm.querySelector('input[name="preset"]:checked');
      if (!picked) return 0;
      if (picked.value !== "other") return Number(picked.value);
      return Number(String(customInput.value).replace(/[^\d]/g, "")) || 0;
    };

    var refreshButton = function () {
      if (giveBusy) return;
      var amt = chosenAmount();
      giveSubmit.textContent =
        amt >= GIFT_MIN_NAIRA ? "Give " + naira(amt) : "Give with Paystack";
    };

    var setGiveBusy = function (on, label) {
      giveBusy = on;
      giveSubmit.disabled = on;
      if (on) giveSubmit.textContent = label;
      else refreshButton();
    };

    giveForm.addEventListener("change", function (e) {
      if (e.target.name === "preset") {
        var other = e.target.value === "other";
        customWrap.hidden = !other;
        if (other) customInput.focus();
      }
      refreshButton();
    });

    customInput.addEventListener("input", function () {
      var digits = customInput.value.replace(/[^\d]/g, "").slice(0, 9);
      customInput.value = digits ? Number(digits).toLocaleString("en-NG") : "";
      refreshButton();
    });

    // Load Paystack's script only when someone actually wants to give.
    var paystackReady;
    var loadPaystack = function () {
      if (window.PaystackPop) return Promise.resolve();
      if (!paystackReady) {
        paystackReady = new Promise(function (resolve, reject) {
          var s = document.createElement("script");
          s.src = "https://js.paystack.co/v2/inline.js";
          s.onload = resolve;
          s.onerror = function () {
            paystackReady = null;
            reject(new Error("Could not load Paystack"));
          };
          document.head.appendChild(s);
        });
      }
      return paystackReady;
    };

    var logGift = function (gift) {
      if (!RSVP_ENDPOINT) return;
      var body = new URLSearchParams({
        type: "gift",
        reference: gift.reference,
        name: gift.name,
        email: gift.email,
        note: gift.note,
      });
      // Best effort: the payment has already gone through on Paystack.
      fetch(RSVP_ENDPOINT, { method: "POST", body: body })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (!data || !data.ok)
            console.warn("Gift not logged:", data && data.error);
        })
        .catch(function (err) {
          console.warn("Gift not logged:", err);
        });
    };

    var showGiveThanks = function (gift) {
      give.querySelector("[data-give-name]").textContent =
        gift.name.split(" ")[0];
      give.querySelector("[data-give-amount]").textContent = naira(gift.amount);
      giveFormWrap.hidden = true;
      giveThanks.hidden = false;
    };

    give
      .querySelector("[data-give-again]")
      .addEventListener("click", function () {
        giveForm.reset();
        customWrap.hidden = true;
        giveErr("");
        refreshButton();
        giveThanks.hidden = true;
        giveFormWrap.hidden = false;
      });

    giveForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (giveBusy) return;
      var fd = new FormData(giveForm);
      var amount = chosenAmount();
      var name = String(fd.get("name") || "").trim();
      var email = String(fd.get("email") || "").trim();
      var note = String(fd.get("note") || "").trim();

      if (!amount) return giveErr("Please choose an amount.");
      if (amount < GIFT_MIN_NAIRA)
        return giveErr(
          "The smallest gift we can accept online is " +
            naira(GIFT_MIN_NAIRA) +
            ".",
        );
      if (!name) return giveErr("Please add your name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return giveErr("Please add a valid email address for your receipt.");
      giveErr("");

      var gift = {
        amount: amount,
        name: name,
        email: email,
        note: note,
        reference:
          "EK-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      };

      setGiveBusy(true, "Opening Paystack…");
      loadPaystack()
        .then(function () {
          var popup = new window.PaystackPop();
          popup.newTransaction({
            key: PAYSTACK_PUBLIC_KEY,
            email: email,
            amount: amount * 100, // kobo
            currency: "NGN",
            reference: gift.reference,
            metadata: {
              custom_fields: [
                {
                  display_name: "Guest name",
                  variable_name: "guest_name",
                  value: name,
                },
                {
                  display_name: "Note",
                  variable_name: "note",
                  value: note || "-",
                },
              ],
            },
            onSuccess: function (tx) {
              if (tx && tx.reference) gift.reference = tx.reference;
              setGiveBusy(false);
              showGiveThanks(gift);
              logGift(gift);
            },
            onCancel: function () {
              setGiveBusy(false);
            },
            onError: function (err) {
              setGiveBusy(false);
              giveErr(
                (err && err.message) ||
                  "Paystack couldn't start the payment. Please try again.",
              );
            },
          });
        })
        .catch(function () {
          setGiveBusy(false);
          giveErr(
            "We couldn't reach Paystack. Please check your connection and try again.",
          );
        });
    });
  }
})();
