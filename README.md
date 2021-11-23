# Shared Health Record

[![CI/CD](https://github.com/I-TECH-UW/shared-health-record/actions/workflows/main.yml/badge.svg)](https://github.com/I-TECH-UW/shared-health-record/actions/workflows/main.yml)

An FHIR-based Implementation of the Shared Health Record (SHR) as specified in section 3.6 of the [OpenHIE Architecture Specifications](https://ohie.org/framework/).

This project implements the following FHIR IGs:
1. Lab Workflows: https://i-tech-uw.github.io/emr-lis-ig/, https://b-techbw.github.io/bw-lab-ig
2. International Patient Summary: http://hl7.org/fhir/uv/ips/

## Dev Guide

### Local Development
```sh
git clone https://github.com/I-TECH-UW/shared-health-record.git
cd shared-health-record

docker-compose -f .\dev.docker-compose.yml --profile dev up -d

yarn
yarn build
yarn start
```

### Docker Compose Entry
```sh
  shr:
    container_name: shr
    hostname: shr
    image: ghcr.io/i-tech-uw/shared-health-record:latest
    ports:
      - 3000:3000
    environment:
      - NODE_ENV=docker
    volumes:
      - ./config/config_docker.json:/app/config/config_docker.json
      - ./config/config_docker.json:/app/config/mediator_docker.json
```

See the `docker-compose.yml` files for examples of integration with OpenHIM and other OpenHIE components

## References
1. Supports the [International Patient Summary](http://hl7.org/fhir/uv/ips/)

2. Supports the [OpenHIE Laboratory Workflows](https://i-tech-uw.github.io/emr-lis-ig/)
