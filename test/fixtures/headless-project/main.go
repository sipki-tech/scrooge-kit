package main

import (
	"fmt"

	"scroogekit.test/headlessfixture/greet"
)

func main() {
	// Known reference to greet.Greet — reference queries must surface this.
	fmt.Println(greet.Greet("world"))
}
