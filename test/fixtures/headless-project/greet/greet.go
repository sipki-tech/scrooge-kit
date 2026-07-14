package greet

// Greet returns a friendly greeting for name.
// Referenced from main.go — the known Go call site for reference checks.
func Greet(name string) string {
	return "Hello, " + name + "!"
}
