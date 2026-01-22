# Ruby file with inheritance for testing
class Animal
  def speak
    raise NotImplementedError
  end
end

class Dog < Animal
  def speak
    "Woof!"
  end

  def fetch(item)
    "Fetching #{item}"
  end
end

module Trainable
  def train(command)
    "Training #{command}"
  end
end

class ServiceDog < Dog
  include Trainable

  def assist(task)
    "Assisting with #{task}"
  end
end
