build:
	echo $(shell git rev-parse HEAD --short)

all: build
