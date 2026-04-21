# Sergent_Tobogo

Monorepo de travail pour les projets Sergent Tobogo.

Le premier projet est une application de gestion de stock textile, hebergee sur GitHub Pages et connectee au repository pour lire et ecrire les donnees de stock.

## Structure

- apps/stock-manager : application React + TypeScript + Vite
- data/stock/products.json : catalogue et stock versionnes
- data/stock/movements.json : journal des mouvements
- scripts/import/import_stock_xls.py : conversion du fichier XLS source vers JSON

## Principe de sauvegarde

L'application n'utilise aucun cache navigateur pour les donnees de stock.

- Lecture : depuis le repository GitHub
- Ecriture : via l'API GitHub Contents
- Authentification : un fine-grained personal access token GitHub saisi a chaque session

Le token doit avoir au minimum le droit Contents: Read and write sur le repository.

## Developpement local

### Frontend

1. Aller dans apps/stock-manager
2. Installer les dependances avec npm install
3. Lancer le dev server avec npm run dev
4. Ouvrir l'adresse locale affichee par Vite

### Regenerer les donnees depuis Excel

Avec un environnement Python disposant de xlrd :

1. Installer la dependance de scripts/import/requirements.txt
2. Executer :

python scripts/import/import_stock_xls.py "Stock Tshirts.xls" data/stock/products.json

## Deploiement

Le workflow GitHub Actions .github/workflows/deploy-stock-manager.yml construit apps/stock-manager puis publie le dist sur GitHub Pages.