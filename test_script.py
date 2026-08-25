#!/usr/bin/env python3
"""
Test script for Compilator Python execution
"""
print("Hello from Python script!")
print("This is a test script executed by Compilator.")
print("Script execution successful!")

# You can add arguments handling
import sys
if len(sys.argv) > 1:
    print(f"Arguments received: {sys.argv[1:]}")
else:
    print("No arguments received")

print("Test completed.")