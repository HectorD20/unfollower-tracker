# Unfollower Tracker

Herramienta web privada para detectar quién no te sigue de vuelta en Instagram. Todo el procesamiento ocurre **100% en tu navegador** — tus datos nunca se envían a ningún servidor.

## Uso

1. Descarga tu información de Instagram en formato JSON (seguidores y seguidos).
2. Abre `index.html` en tu navegador.
3. Arrastra la carpeta descomprimida o carga los archivos `followers_*.json` y `following*.json`.
4. Haz clic en **Analizar seguimiento**.

También puedes usar la [versión en GitHub Pages](https://hectord20.github.io/unfollower-tracker/) si está activada.

## Cómo obtener los archivos de Instagram

1. Instagram → **Configuración y actividad** → **Centro de cuentas**
2. **Tu información y permisos** → **Descargar tu información**
3. Formato **JSON**, selecciona **Seguidores y seguidos**
4. Espera el correo de Meta y descomprime el ZIP

## Estructura del proyecto

```
├── index.html      # Página principal
├── css/styles.css  # Estilos
└── js/app.js       # Lógica de procesamiento
```

## Privacidad

Esta herramienta no requiere inicio de sesión, no usa APIs de Instagram ni sube tus archivos a internet. Los JSON se leen localmente con la API de archivos del navegador.

## Licencia

Uso personal. No afiliado a Instagram ni Meta.
