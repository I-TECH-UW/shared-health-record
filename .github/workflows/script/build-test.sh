#!/bin/bash
docker build --build-arg NODE_AUTH_TOKEN=$env:NODE_AUTH_TOKEN ./ -t test-image:latest 

docker-compose -f ci.docker-compose.yml pull shr-fhir openhim-core mongo-db newman kafka zookeeper
docker-compose -f ci.docker-compose.yml up -d shr-fhir mongo-db openhim-core kafka zookeeper

sleep 60

docker-compose -f ci.docker-compose.yml up -d openhim-config

sleep 20

docker-compose -f ci.docker-compose.yml logs openhim-config
docker-compose -f ci.docker-compose.yml up -d shr

docker-compose -f ci.docker-compose.yml ps

docker-compose -f ci.docker-compose.yml up mllp_tests

declare -a tests=("https://www.getpostman.com/collections/481bb6cc8e1e964fd8bd" 
                "https://www.getpostman.com/collections/ff5183adca5b5e720338" 
                "https://www.getpostman.com/collections/2ee8ebff39c078bac256"
                )

for url in "${tests[@]}"
do
   echo "Testing url: $url"
   export POSTMAN_COLLECTION=$url

   docker-compose -f ci.docker-compose.yml up --exit-code-from newman newman 
done


# docker-compose -f ci.docker-compose.yml down -v