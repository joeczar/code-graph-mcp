# Test fixture for call relationship extraction in Ruby

def helper
  42
end

def main
  result = helper()
  result
end

class Calculator
  def add(a, b)
    a + b
  end

  def calculate
    add(1, 2)
  end
end
