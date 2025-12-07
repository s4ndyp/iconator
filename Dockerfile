# STAGE 1: Dependency Installatie
# Gebruik een Node.js Long Term Support (LTS) versie als basis
FROM node:lts-alpine as dependency_installer

# Stel de werkdirectory in
WORKDIR /app

# Kopieer package.json en package-lock.json om caching van node_modules te maximaliseren
COPY package*.json ./

# Installeer de Node.js afhankelijkheden (express en multer)
RUN npm install --omit=dev

# STAGE 2: Productie Image
# Gebruik een schone, kleine Alpine-gebaseerde Node.js runtime image
FROM node:lts-alpine

# Stel de werkdirectory in
WORKDIR /app

# Kopieer de geïnstalleerde node_modules van Stage 1
COPY --from=dependency_installer /app/node_modules ./node_modules

# Kopieer de rest van de applicatiebestanden:
# 1. De server logica
COPY server.js .
# 2. De statische frontend bestanden (index.html, etc.)
COPY public ./public
# 3. De uploads map is nodig zodat Multer de doelmap kan aanmaken
# Hoewel de map leeg is, definieert dit de structuur voor Multer.
RUN mkdir -p uploads

# Zorg ervoor dat de 'uploads' map bestaat, dit wordt gebruikt door server.js
# De map 'uploads' is de plek waar de iconen zullen worden opgeslagen in de container.

# De poort die door Express (server.js) wordt gebruikt
EXPOSE 3000

# Definieer het commando om de applicatie te starten
CMD ["node", "server.js"]
