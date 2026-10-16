<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <base href="/" />
    <title>UT TECAMACHALCO</title>
    <script>
      (async () => {
        try {
          const response = await fetch("/index.html", { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const source = await response.text();
          const parsed = new DOMParser().parseFromString(source, "text/html");
          const bodyNodes = [...parsed.body.childNodes];
          const headNodes = [...parsed.head.children];
          const scripts = bodyNodes.filter((node) => node.nodeName === "SCRIPT");

          for (const node of headNodes) {
            if (node.nodeName === "LINK" && node.rel === "icon") {
              node.href = "/assets/logo.png";
            }
          }

          document.head.replaceChildren(
            document.createElement("base"),
            ...headNodes
          );
          document.head.querySelector("base").href = "/";
          document.body.replaceChildren(
            ...bodyNodes.filter((node) => node.nodeName !== "SCRIPT")
          );

          for (const script of scripts) {
            const executable = document.createElement("script");
            executable.textContent = script.textContent;
            document.body.append(executable);
          }
        } catch (error) {
          document.body.textContent = "No se pudo cargar la página.";
          console.error(error);
        }
      })();
    </script>
  </head>
  <body></body>
</html>
