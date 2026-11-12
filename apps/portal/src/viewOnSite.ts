import { api } from "./api";
import { showToast } from "./components/Toasts";

/**
 * Review mode: the site in a new tab, with its notes drawn over it. The tab
 * opens straight away (a popup blocker would stop one opened after waiting
 * for the link), then goes to the link once it's made.
 */
export function viewOnSite(siteId: string, path?: string) {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  api.reviewLink(siteId, path).then(
    ({ url }) => {
      if (tab) tab.location.href = url;
      else window.location.href = url;
    },
    (err: Error) => {
      tab?.close();
      showToast({ message: err.message });
    },
  );
}
