FROM nginx:1.27-alpine

COPY . /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["sh", "-c", "printf 'window.SHOPBUILDER_CONFIG = { API_URL: \"%s\" };\\n' \"${API_URL:-}\" > /usr/share/nginx/html/config.js && nginx -g 'daemon off;'"]
