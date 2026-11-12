
VOL_DIR = /home/sel-maaq/data
COMPOSE_FILE = srcs/docker-compose.yml


all: up

up: setup
	docker-compose -f $(COMPOSE_FILE) up -d --build

setup:
	mkdir -p $(VOL_DIR)/mariadb $(VOL_DIR)/wordpress

down:
	docker-compose -f $(COMPOSE_FILE) down

start:
	docker-compose -f $(COMPOSE_FILE) start

stop:
	docker-compose -f $(COMPOSE_FILE) stop

restart:
	docker-compose -f $(COMPOSE_FILE) restart

ps:
	docker-compose -f $(COMPOSE_FILE) ps

clean:
	docker-compose -f $(COMPOSE_FILE) down -v
	sudo rm -rf $(VOL_DIR)

re: clean all
