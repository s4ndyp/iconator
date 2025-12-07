# STAGE 1: Dependency Installatie
# Gebruik een Node.js Long Term Support (LTS) versie als basis
FROM node:lts-alpine as dependency_installer

# Stel de werkdirectory in de container in
WORKDIR /app

# Kopieer package.json en package-lock.json EERST.
# Dit is slim voor Docker caching: als je code verandert maar je dependencies niet,
# hoeft Docker deze stap niet opnieuw te doen.
COPY package*.json ./

# Installeer de Node.js afhankelijkheden (express, multer, cors, archiver)
# --omit=dev zorgt ervoor dat we geen onnodige development tools installeren, wat de image kleiner houdt.
RUN npm install --omit=dev

# STAGE 2: Productie Image
# We beginnen opnieuw met een schone, kleine Alpine image om de eindgrootte minimaal te houden.
FROM node:lts-alpine

# Stel de werkdirectory in
WORKDIR /app

# Kopieer de 'schone' node_modules map van Stage 1 naar deze image
COPY --from=dependency_installer /app/node_modules ./node_modules

# Kopieer de applicatie broncode:
# 1. De server logica (backend)
COPY server.js .

# 2. De frontend bestanden (HTML, CSS, JS) naar de publieke map
COPY public ./public

# 3. CRUCIAAL VOOR DE UPDATE: Maak de opslagmappen aan
# - 'uploads': Hier slaat Multer de plaatjes op
# - 'data': Hier komt de nieuwe database (db.json) te staan
RUN mkdir -p uploads
RUN mkdir -p data

# De poort die door Express (server.js) wordt gebruikt openzetten
EXPOSE 3000

# Het startcommando: start de Node.js server
CMD ["node", "server.js"]
