# Nutze ein schlankes nginx Image
FROM nginx:alpine

# Kopiere alle Projektdateien ins nginx html Verzeichnis
COPY . /usr/share/nginx/html

# Exponiere Port 80
EXPOSE 80

# Starte nginx (Standard im Image)
